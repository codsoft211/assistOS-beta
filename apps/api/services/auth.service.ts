import { db } from '../db';
import { users, userTenants, tenants } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SALT_ROUNDS = 10;

// Supabase admin client for auth operations
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[Auth] Supabase credentials not configured - auth sync disabled');
    return null;
  }
  
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  return supabaseAdmin;
}

// Create user in Supabase auth schema
async function createSupabaseAuthUser(data: {
  id: string;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.log('[Auth] Skipping Supabase auth sync - not configured');
    return;
  }

  try {
    const { error } = await supabase.auth.admin.createUser({
      id: data.id,
      email: data.email,
      password: data.password || undefined,
      email_confirm: true, // Auto-confirm email since we handle verification separately
      user_metadata: {
        first_name: data.firstName,
        last_name: data.lastName,
        full_name: `${data.firstName} ${data.lastName}`,
      },
    });

    if (error) {
      // If user already exists in Supabase, that's okay
      if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
        console.log(`[Auth] Supabase auth user already exists: ${data.email}`);
        return;
      }
      console.error('[Auth] Failed to create Supabase auth user:', error.message);
      throw new Error(`Supabase auth error: ${error.message}`);
    }

    console.log(`[Auth] Created Supabase auth user: ${data.email} (${data.id})`);
  } catch (error) {
    // Don't fail user creation if Supabase sync fails - log and continue
    console.error('[Auth] Supabase auth sync error:', error);
    // Re-throw only if it's a critical error we created
    if (error instanceof Error && error.message.startsWith('Supabase auth error:')) {
      throw error;
    }
  }
}

// Delete user from Supabase auth schema
export async function deleteSupabaseAuthUser(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.log('[Auth] Skipping Supabase auth delete - not configured');
    return;
  }

  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      // If user doesn't exist, that's okay
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        console.log(`[Auth] Supabase auth user not found: ${userId}`);
        return;
      }
      console.error('[Auth] Failed to delete Supabase auth user:', error.message);
    } else {
      console.log(`[Auth] Deleted Supabase auth user: ${userId}`);
    }
  } catch (error) {
    console.error('[Auth] Supabase auth delete error:', error);
  }
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  isActive: boolean;
  isPlatformAdmin?: boolean;
  lastLogin?: Date | null;
  createdAt?: Date | null;
  googleId?: string | null;
}

export interface UserWithTenant extends AuthUser {
  tenantId: string;
  role: string;
  permissions?: any;
  scopes?: any;
}

// Password hashing
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Create user (email + password OR Google OAuth)
export async function createUser(data: {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  googleId?: string;
  avatar?: string;
  isPlatformAdmin?: boolean;
}): Promise<AuthUser> {
  const passwordHash = data.password ? await hashPassword(data.password) : null;

  const [user] = await db
    .insert(users)
    .values({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      password: passwordHash,
      googleId: data.googleId || null,
      avatar: data.avatar || null,
      isActive: true,
      isPlatformAdmin: data.isPlatformAdmin || false,
    })
    .returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.avatar,
      googleId: users.googleId,
      isActive: users.isActive,
      isPlatformAdmin: users.isPlatformAdmin,
      lastLogin: users.lastLogin,
    });

  // Sync user to Supabase auth schema
  await createSupabaseAuthUser({
    id: user.id,
    email: user.email,
    password: data.password, // Pass original password (not hash) for Supabase
    firstName: user.firstName,
    lastName: user.lastName,
  });

  return user;
}

// Authenticate user with email + password
export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return null;
  }

  if (!user.password) {
    // User created via Google OAuth - no password set
    return null;
  }

  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
    return null;
  }

  if (!user.isActive) {
    throw new Error('User account is disabled');
  }

  // Update last login
  await db
    .update(users)
    .set({ lastLogin: new Date() })
    .where(eq(users.id, user.id));

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    googleId: user.googleId,
    isActive: user.isActive,
    isPlatformAdmin: user.isPlatformAdmin,
    lastLogin: new Date(),
  };
}

// Find or create user from Google OAuth
export async function findOrCreateUserFromGoogle(googleProfile: {
  id: string;
  email: string;
  given_name: string;
  family_name: string;
  picture?: string;
}): Promise<AuthUser> {
  // Try to find existing user by Google ID
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.googleId, googleProfile.id))
    .limit(1);

  if (user) {
    // Update last login and potentially new avatar
    await db
      .update(users)
      .set({ 
        lastLogin: new Date(),
        avatar: googleProfile.picture || user.avatar,
      })
      .where(eq(users.id, user.id));
    
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: googleProfile.picture || user.avatar,
      googleId: user.googleId,
      isActive: user.isActive,
      isPlatformAdmin: user.isPlatformAdmin,
      lastLogin: new Date(),
    };
  }

  // Try to find by email (user might have registered with email first)
  [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, googleProfile.email))
    .limit(1);

  if (user) {
    // Link Google account to existing user
    await db
      .update(users)
      .set({ 
        googleId: googleProfile.id,
        avatar: googleProfile.picture || user.avatar,
        lastLogin: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: googleProfile.picture || user.avatar,
      googleId: googleProfile.id,
      isActive: user.isActive,
      isPlatformAdmin: user.isPlatformAdmin,
      lastLogin: new Date(),
    };
  }

  // Create new user from Google
  return createUser({
    email: googleProfile.email,
    firstName: googleProfile.given_name,
    lastName: googleProfile.family_name,
    googleId: googleProfile.id,
    avatar: googleProfile.picture,
  });
}

// Get user by ID
export async function getUserById(userId: string): Promise<AuthUser | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.avatar,
      googleId: users.googleId,
      isActive: users.isActive,
      isPlatformAdmin: users.isPlatformAdmin,
      lastLogin: users.lastLogin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user || null;
}

// Get user by email
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.avatar,
      googleId: users.googleId,
      isActive: users.isActive,
      isPlatformAdmin: users.isPlatformAdmin,
      lastLogin: users.lastLogin,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user || null;
}

// Get all users (admin only)
export async function getAllUsers(): Promise<(AuthUser & { createdAt: Date })[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.avatar,
      googleId: users.googleId,
      isActive: users.isActive,
      isPlatformAdmin: users.isPlatformAdmin,
      lastLogin: users.lastLogin,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt);
}

// Update user
export async function updateUser(userId: string, updates: Partial<{
  firstName: string;
  lastName: string;
  avatar: string;
  isActive: boolean;
}>): Promise<AuthUser | null> {
  // Explicitly map allowed fields
  const allowedUpdates: any = { updatedAt: new Date() };
  
  if (updates.firstName !== undefined) allowedUpdates.firstName = updates.firstName;
  if (updates.lastName !== undefined) allowedUpdates.lastName = updates.lastName;
  if (updates.avatar !== undefined) allowedUpdates.avatar = updates.avatar;
  if (updates.isActive !== undefined) allowedUpdates.isActive = updates.isActive;

  await db
    .update(users)
    .set(allowedUpdates)
    .where(eq(users.id, userId));

  return getUserById(userId);
}

// Change password
export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ password: passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
