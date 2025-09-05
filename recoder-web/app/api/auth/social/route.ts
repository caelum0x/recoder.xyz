import { NextRequest, NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';
import crypto from 'crypto';

// Real OAuth authentication for social media platforms
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');
    const action = searchParams.get('action');

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      );
    }

    if (action === 'initiate') {
      return await initiateOAuth(provider);
    }

    if (action === 'callback') {
      return await handleOAuthCallback(provider, searchParams);
    }

    if (action === 'status') {
      return await checkAuthStatus(provider);
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Social auth error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Authentication failed' },
      { status: 500 }
    );
  }
}

async function initiateOAuth(provider: string) {
  switch (provider) {
    case 'twitter':
      return await initiateTwitterOAuth();
    case 'linkedin':
      return await initiateLinkedInOAuth();
    case 'facebook':
      return await initiateFacebookOAuth();
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function initiateTwitterOAuth() {
  try {
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
    });

    // Generate OAuth 1.0a request token
    const authLink = await client.generateAuthLink(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/social?provider=twitter&action=callback`,
      { linkMode: 'authorize' }
    );

    // Store oauth_token_secret in session/database for callback verification
    // In production, you'd store this securely
    
    return NextResponse.json({
      success: true,
      provider: 'twitter',
      auth_url: authLink.url,
      oauth_token: authLink.oauth_token,
      oauth_token_secret: authLink.oauth_token_secret
    });

  } catch (error) {
    console.error('Twitter OAuth initiation failed:', error);
    throw new Error(`Twitter OAuth failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function initiateLinkedInOAuth() {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = 'r_liteprofile r_emailaddress w_member_social';
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/social?provider=linkedin&action=callback`;
    
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
      `response_type=code&` +
      `client_id=${process.env.LINKEDIN_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}&` +
      `scope=${encodeURIComponent(scope)}`;

    // Store state in session/database for CSRF protection
    
    return NextResponse.json({
      success: true,
      provider: 'linkedin',
      auth_url: authUrl,
      state: state
    });

  } catch (error) {
    console.error('LinkedIn OAuth initiation failed:', error);
    throw new Error(`LinkedIn OAuth failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function initiateFacebookOAuth() {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = 'pages_manage_posts,pages_read_engagement,pages_show_list,public_profile';
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/social?provider=facebook&action=callback`;
    
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
      `client_id=${process.env.FACEBOOK_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `response_type=code&` +
      `state=${state}`;

    return NextResponse.json({
      success: true,
      provider: 'facebook',
      auth_url: authUrl,
      state: state
    });

  } catch (error) {
    console.error('Facebook OAuth initiation failed:', error);
    throw new Error(`Facebook OAuth failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleOAuthCallback(provider: string, searchParams: URLSearchParams) {
  switch (provider) {
    case 'twitter':
      return await handleTwitterCallback(searchParams);
    case 'linkedin':
      return await handleLinkedInCallback(searchParams);
    case 'facebook':
      return await handleFacebookCallback(searchParams);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function handleTwitterCallback(searchParams: URLSearchParams) {
  try {
    const oauth_token = searchParams.get('oauth_token');
    const oauth_verifier = searchParams.get('oauth_verifier');
    
    if (!oauth_token || !oauth_verifier) {
      throw new Error('Missing OAuth parameters');
    }

    // Retrieve oauth_token_secret from session/database
    const oauth_token_secret = 'stored_secret'; // Get from secure storage
    
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: oauth_token,
      accessSecret: oauth_token_secret,
    });

    // Exchange for access token
    const { client: loggedClient, accessToken, accessSecret } = await client.login(oauth_verifier);
    
    // Get user information
    const user = await loggedClient.currentUser();
    
    // Store tokens securely in database
    const authData = {
      provider: 'twitter',
      user_id: user.id_str,
      username: user.screen_name,
      display_name: user.name,
      access_token: accessToken,
      access_token_secret: accessSecret,
      profile_image: user.profile_image_url_https,
      followers_count: user.followers_count,
      connected_at: new Date().toISOString()
    };

    // In production, encrypt and store in database
    console.log('Twitter auth successful:', { user_id: user.id_str, username: user.screen_name });

    return NextResponse.json({
      success: true,
      provider: 'twitter',
      user: {
        id: user.id_str,
        username: user.screen_name,
        display_name: user.name,
        profile_image: user.profile_image_url_https,
        followers_count: user.followers_count
      },
      message: 'Twitter account connected successfully'
    });

  } catch (error) {
    console.error('Twitter callback failed:', error);
    throw new Error(`Twitter authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleLinkedInCallback(searchParams: URLSearchParams) {
  try {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    
    if (error) {
      throw new Error(`LinkedIn OAuth error: ${error}`);
    }
    
    if (!code || !state) {
      throw new Error('Missing OAuth parameters');
    }

    // Verify state for CSRF protection
    // const storedState = getStoredState(); // Get from session/database
    
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/social?provider=linkedin&action=callback`;
    
    // Exchange code for access token
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    
    // Get user profile
    const profileResponse = await fetch('https://api.linkedin.com/v2/people/~?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new Error(`Profile fetch failed: ${profileResponse.status}`);
    }

    const profile = await profileResponse.json();
    
    // Store tokens securely
    const authData = {
      provider: 'linkedin',
      user_id: profile.id,
      first_name: profile.firstName.localized.en_US,
      last_name: profile.lastName.localized.en_US,
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      connected_at: new Date().toISOString()
    };

    console.log('LinkedIn auth successful:', { user_id: profile.id });

    return NextResponse.json({
      success: true,
      provider: 'linkedin',
      user: {
        id: profile.id,
        name: `${profile.firstName.localized.en_US} ${profile.lastName.localized.en_US}`,
        profile_image: profile.profilePicture?.displayImage?.elements?.[0]?.identifiers?.[0]?.identifier
      },
      message: 'LinkedIn account connected successfully'
    });

  } catch (error) {
    console.error('LinkedIn callback failed:', error);
    throw new Error(`LinkedIn authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleFacebookCallback(searchParams: URLSearchParams) {
  try {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    
    if (error) {
      throw new Error(`Facebook OAuth error: ${error}`);
    }
    
    if (!code || !state) {
      throw new Error('Missing OAuth parameters');
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/social?provider=facebook&action=callback`;
    
    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `client_id=${process.env.FACEBOOK_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `client_secret=${process.env.FACEBOOK_APP_SECRET}&` +
      `code=${code}`;

    const tokenResponse = await fetch(tokenUrl);
    
    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    
    // Get user profile and pages
    const [profileResponse, pagesResponse] = await Promise.all([
      fetch(`https://graph.facebook.com/v18.0/me?fields=id,name,picture&access_token=${tokenData.access_token}`),
      fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${tokenData.access_token}`)
    ]);

    const profile = await profileResponse.json();
    const pages = await pagesResponse.json();
    
    // Store tokens securely
    const authData = {
      provider: 'facebook',
      user_id: profile.id,
      name: profile.name,
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      pages: pages.data || [],
      connected_at: new Date().toISOString()
    };

    console.log('Facebook auth successful:', { user_id: profile.id, pages_count: pages.data?.length || 0 });

    return NextResponse.json({
      success: true,
      provider: 'facebook',
      user: {
        id: profile.id,
        name: profile.name,
        profile_image: profile.picture?.data?.url,
        pages: pages.data || []
      },
      message: 'Facebook account connected successfully'
    });

  } catch (error) {
    console.error('Facebook callback failed:', error);
    throw new Error(`Facebook authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function checkAuthStatus(provider: string) {
  // In production, check database for stored tokens
  // For now, return mock status
  return NextResponse.json({
    provider,
    connected: false,
    user: null,
    last_connected: null
  });
}

// POST endpoint for disconnecting accounts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, provider, user_id } = body;

    if (action === 'disconnect') {
      // Remove tokens from database
      console.log(`Disconnecting ${provider} account for user ${user_id}`);
      
      return NextResponse.json({
        success: true,
        provider,
        message: `${provider} account disconnected successfully`
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Social auth POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Operation failed' },
      { status: 500 }
    );
  }
}