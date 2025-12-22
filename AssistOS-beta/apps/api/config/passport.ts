import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { findOrCreateUserFromGoogle, getUserById } from '../services/auth.service';
import { getUserTenants, createTenant } from '../services/tenant.service';
import { generateUniqueSlug } from '../utils/slug';
import { getOAuthCallbacks } from './environment';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const CALLBACK_URL = getOAuthCallbacks().google;

// Configure Google OAuth Strategy
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: CALLBACK_URL,
        scope: ['profile', 'email'],
        passReqToCallback: true,
      },
      async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          // Extract profile data
          const googleProfile = {
            id: profile.id,
            email: profile.emails?.[0]?.value || '',
            given_name: profile.name?.givenName || 'User',
            family_name: profile.name?.familyName || '',
            picture: profile.photos?.[0]?.value,
          };

          if (!googleProfile.email) {
            return done(new Error('No email provided by Google'), undefined);
          }

          // Find or create user
          const user = await findOrCreateUserFromGoogle(googleProfile);

          // Check if user has any tenants
          const userTenants = await getUserTenants(user.id);

          // If new user with no tenant, auto-create one
          if (userTenants.length === 0) {
            const companyName = `${user.firstName}'s Organization`;
            const baseSlug = user.firstName.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const uniqueSlug = await generateUniqueSlug(baseSlug);
            
            await createTenant({
              name: companyName,
              slug: uniqueSlug,
              ownerId: user.id,
            });
          }

          // Regenerate session to prevent session fixation attacks
          await new Promise<void>((resolve, reject) => {
            req.session.regenerate((err: any) => err ? reject(err) : resolve());
          });

          return done(null, user);
        } catch (error) {
          console.error('Google OAuth error:', error);
          return done(error as Error, undefined);
        }
      }
    )
  );
}

// Serialize user to session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await getUserById(id);
    if (!user) {
      return done(new Error('User not found'), null);
    }
    done(null, user);
  } catch (error) {
    done(error as Error, null);
  }
});

export default passport;
