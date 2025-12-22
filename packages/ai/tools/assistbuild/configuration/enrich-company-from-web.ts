import { ToolBase, type ToolManifest } from '../../kernel';

interface EnrichCompanyInput {
  companyName?: string;
  website?: string;
  nif?: string;
  country?: string;
  searchSources?: ('website' | 'google_business' | 'google_reviews' | 'linkedin' | 'social_media')[];
}

interface EnrichedCompanyData {
  brandName?: string;
  legalName?: string;
  nif?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  sector?: string;
  businessDescription?: string;
  businessType?: string;
  socialProfiles?: {
    linkedin?: string;
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  reviews?: {
    googleRating?: number;
    googleReviewCount?: number;
    summary?: string;
  };
  additionalInfo?: Array<{ key: string; value: string }>;
}

export class EnrichCompanyFromWebTool extends ToolBase<EnrichCompanyInput, any> {
  manifest: ToolManifest = {
    name: 'enrich_company_from_web',
    category: 'configuration',
    description: `🌐 Searches the web to automatically fetch company information from multiple sources (website, Google Business, Google Reviews, LinkedIn, social media). 
    
Use this BEFORE configure_company_info to auto-fill company data. Returns structured data ready for configuration.

Example usage flow:
1. User says "setup my company TechCorp"
2. Call enrich_company_from_web with companyName="TechCorp" 
3. Review returned data with user
4. Call configure_company_info with the enriched data`,
    parameters: [
      {
        name: 'companyName',
        type: 'string',
        description: 'Company name to search for (e.g., "TechCorp", "Sonae MC")',
        required: false
      },
      {
        name: 'website',
        type: 'string',
        description: 'Company website URL to analyze (e.g., "https://techcorp.com")',
        required: false
      },
      {
        name: 'nif',
        type: 'string',
        description: 'Company tax ID (NIF/VAT) to search for company registry data',
        required: false
      },
      {
        name: 'country',
        type: 'string',
        description: 'Country to focus the search (e.g., "Portugal", "Brazil", "USA")',
        required: false
      },
      {
        name: 'searchSources',
        type: 'array',
        description: 'Which sources to search. Default: all sources.',
        required: false,
        items: {
          type: 'string',
          enum: ['website', 'google_business', 'google_reviews', 'linkedin', 'social_media']
        }
      }
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: EnrichCompanyInput,
    context: any,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    // Validate at least one search parameter is provided
    if (!input.companyName && !input.website && !input.nif) {
      return {
        success: false,
        error: 'Please provide at least one of: companyName, website, or nif'
      };
    }

    onProgress?.(10, '🔍 Preparing web search...');

    const apiKey = process.env.PERPLEXITY_API_KEY;
    
    if (!apiKey) {
      console.error('[enrich_company_from_web] PERPLEXITY_API_KEY not found');
      return {
        success: false,
        error: 'Perplexity API key not configured. Please add PERPLEXITY_API_KEY to environment variables.'
      };
    }

    try {
      // Build search query based on inputs
      const searchQuery = this.buildSearchQuery(input);
      
      onProgress?.(30, `🌐 Searching: "${searchQuery.substring(0, 50)}..."`);

      // Call Perplexity API with specialized company research prompt
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar-pro', // Use sonar-pro for better accuracy
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt()
            },
            {
              role: 'user',
              content: searchQuery
            }
          ],
          temperature: 0.1, // Low temperature for factual accuracy
          max_completion_tokens: 2000,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[enrich_company_from_web] Perplexity API error:', response.status, errorText);
        return {
          success: false,
          error: `Perplexity API error (${response.status}): ${errorText}`
        };
      }

      onProgress?.(70, '📊 Processing company data...');

      const data = await response.json();
      const rawAnswer = data.choices?.[0]?.message?.content || '';
      const citations = data.citations || [];

      // Parse the structured response
      const enrichedData = this.parseEnrichedData(rawAnswer);

      onProgress?.(90, '✅ Data enrichment complete');

      // Build response with structured data for configure_company_info
      const configReadyData: Partial<EnrichedCompanyData> = {};
      
      if (enrichedData.brandName) configReadyData.brandName = enrichedData.brandName;
      if (enrichedData.legalName) configReadyData.legalName = enrichedData.legalName;
      if (enrichedData.nif) configReadyData.nif = enrichedData.nif;
      if (enrichedData.address) configReadyData.address = enrichedData.address;
      if (enrichedData.city) configReadyData.city = enrichedData.city;
      if (enrichedData.postalCode) configReadyData.postalCode = enrichedData.postalCode;
      if (enrichedData.country) configReadyData.country = enrichedData.country;
      if (enrichedData.phone) configReadyData.phone = enrichedData.phone;
      if (enrichedData.email) configReadyData.email = enrichedData.email;
      if (enrichedData.website) configReadyData.website = enrichedData.website;
      if (enrichedData.sector) configReadyData.sector = enrichedData.sector;
      if (enrichedData.businessDescription) configReadyData.businessDescription = enrichedData.businessDescription;
      if (enrichedData.businessType) configReadyData.businessType = enrichedData.businessType;

      // Build additional info from social profiles and reviews
      const additionalInfo: Array<{ key: string; value: string }> = [];
      
      if (enrichedData.socialProfiles) {
        if (enrichedData.socialProfiles.linkedin) {
          additionalInfo.push({ key: 'linkedin', value: enrichedData.socialProfiles.linkedin });
        }
        if (enrichedData.socialProfiles.facebook) {
          additionalInfo.push({ key: 'facebook', value: enrichedData.socialProfiles.facebook });
        }
        if (enrichedData.socialProfiles.instagram) {
          additionalInfo.push({ key: 'instagram', value: enrichedData.socialProfiles.instagram });
        }
        if (enrichedData.socialProfiles.twitter) {
          additionalInfo.push({ key: 'twitter', value: enrichedData.socialProfiles.twitter });
        }
      }

      if (enrichedData.reviews) {
        if (enrichedData.reviews.googleRating) {
          additionalInfo.push({ key: 'google_rating', value: String(enrichedData.reviews.googleRating) });
        }
        if (enrichedData.reviews.googleReviewCount) {
          additionalInfo.push({ key: 'google_review_count', value: String(enrichedData.reviews.googleReviewCount) });
        }
        if (enrichedData.reviews.summary) {
          additionalInfo.push({ key: 'reviews_summary', value: enrichedData.reviews.summary });
        }
      }

      if (additionalInfo.length > 0) {
        configReadyData.additionalInfo = additionalInfo;
      }

      onProgress?.(100, '🎉 Company enrichment complete!');

      return {
        success: true,
        enrichedData: configReadyData,
        rawData: enrichedData,
        sources: citations,
        message: `✅ Found company information for "${input.companyName || input.website || input.nif}"`,
        nextStep: {
          tool: 'configure_company_info',
          suggestedInput: configReadyData,
          hint: 'Review the enriched data above and call configure_company_info to save it.'
        }
      };

    } catch (error) {
      console.error('[enrich_company_from_web] Error:', error);
      return {
        success: false,
        error: `Web search error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private buildSearchQuery(input: EnrichCompanyInput): string {
    const parts: string[] = [];
    
    // Primary search terms
    if (input.companyName) {
      parts.push(`company "${input.companyName}"`);
    }
    if (input.website) {
      parts.push(`website ${input.website}`);
    }
    if (input.nif) {
      parts.push(`tax ID/NIF ${input.nif}`);
    }
    if (input.country) {
      parts.push(`in ${input.country}`);
    }

    // Build comprehensive search query
    const baseQuery = parts.join(' ');
    
    return `Find detailed company information for ${baseQuery}. 

I need:
1. **Company Identity**: Legal name, brand name, tax ID (NIF/VAT)
2. **Contact Details**: Address, city, postal code, country, phone, email, website
3. **Business Info**: Industry sector, business description, business model (B2B/B2C/SaaS/etc)
4. **Online Presence**: LinkedIn URL, Facebook, Instagram, Twitter/X
5. **Reviews**: Google Business rating and review count if available

Search the company website, Google Business profile, LinkedIn company page, and any relevant business registries.

Return ALL information you can find. Format your response as structured data.`;
  }

  private getSystemPrompt(): string {
    return `You are a company research specialist. Your task is to find comprehensive company information from web sources.

IMPORTANT: Return your findings in this EXACT JSON format (use null for fields you cannot find):

\`\`\`json
{
  "brandName": "Company Brand Name",
  "legalName": "Legal Company Name Ltd",
  "nif": "123456789",
  "address": "123 Main Street",
  "city": "City Name",
  "postalCode": "12345",
  "country": "Country",
  "phone": "+1234567890",
  "email": "contact@company.com",
  "website": "https://company.com",
  "sector": "technology|finance/fintech|healthcare|retail/e-commerce|manufacturing|consulting|education|real-estate|transportation/logistics|media/entertainment|energy/utilities|nonprofit|government",
  "businessDescription": "Brief description of what the company does",
  "businessType": "b2b|b2c|b2b2c|saas|marketplace|consulting|subscription|agency/professional-services|mobile-app|platform|other",
  "socialProfiles": {
    "linkedin": "https://linkedin.com/company/...",
    "facebook": "https://facebook.com/...",
    "instagram": "https://instagram.com/...",
    "twitter": "https://twitter.com/..."
  },
  "reviews": {
    "googleRating": 4.5,
    "googleReviewCount": 150,
    "summary": "Brief summary of customer reviews"
  }
}
\`\`\`

Rules:
- Only include information you are confident about
- Use null for fields you cannot verify
- The sector must be one of the listed values
- The businessType must be one of the listed values
- Include the JSON block in your response`;
  }

  private parseEnrichedData(rawAnswer: string): EnrichedCompanyData {
    try {
      // Extract JSON from the response
      const jsonMatch = rawAnswer.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        return this.sanitizeEnrichedData(parsed);
      }

      // Try to parse the entire response as JSON
      const directParse = JSON.parse(rawAnswer);
      return this.sanitizeEnrichedData(directParse);

    } catch (error) {
      console.warn('[enrich_company_from_web] Could not parse JSON, extracting manually');
      // Fallback: extract what we can from the text
      return this.extractDataFromText(rawAnswer);
    }
  }

  private sanitizeEnrichedData(data: any): EnrichedCompanyData {
    const validSectors = [
      'technology', 'finance/fintech', 'healthcare', 'retail/e-commerce',
      'manufacturing', 'consulting', 'education', 'real-estate',
      'transportation/logistics', 'media/entertainment', 'energy/utilities',
      'nonprofit', 'government'
    ];
    
    const validBusinessTypes = [
      'b2b', 'b2c', 'b2b2c', 'saas', 'marketplace', 'consulting',
      'subscription', 'agency/professional-services', 'mobile-app', 'platform', 'other'
    ];

    return {
      brandName: data.brandName || undefined,
      legalName: data.legalName || undefined,
      nif: data.nif || undefined,
      address: data.address || undefined,
      city: data.city || undefined,
      postalCode: data.postalCode || undefined,
      country: data.country || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
      website: data.website || undefined,
      sector: validSectors.includes(data.sector) ? data.sector : undefined,
      businessDescription: data.businessDescription || undefined,
      businessType: validBusinessTypes.includes(data.businessType) ? data.businessType : undefined,
      socialProfiles: data.socialProfiles || undefined,
      reviews: data.reviews || undefined,
    };
  }

  private extractDataFromText(text: string): EnrichedCompanyData {
    // Basic extraction patterns for fallback
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    const phoneMatch = text.match(/\+?[\d\s-]{10,}/);
    const websiteMatch = text.match(/https?:\/\/[\w.-]+\.\w+/);
    
    return {
      email: emailMatch ? emailMatch[0] : undefined,
      phone: phoneMatch ? phoneMatch[0].trim() : undefined,
      website: websiteMatch ? websiteMatch[0] : undefined,
    };
  }
}

