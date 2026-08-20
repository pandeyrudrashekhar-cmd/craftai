import 'dotenv/config';

const required = [
    'DATABASE_URL',
    'JWT_SECRET'
];

const configuredClientUrls = [
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL
].flatMap((value) => value ? value.split(',') : []).map((value) => value.trim()).filter(Boolean);

export const env = {
    // Server
    port: Number(process.env.PORT ?? 4000),

    nodeEnv: process.env.NODE_ENV ?? 'development',

    // Frontend URLs allowed by backend
    clientUrls: [
    ...configuredClientUrls,
    'https://craftai-frontend.vercel.app',
    'https://craftai-frontend.onrender.com',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175'
].filter(Boolean),

    // Database
    databaseUrl: process.env.DATABASE_URL,

    // JWT
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',

    // OpenRouter
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openRouterModel: process.env.OPENROUTER_MODEL,

    // GitHub OAuth
    githubClientId: process.env.GITHUB_CLIENT_ID,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
    githubCallbackUrl: process.env.GITHUB_CALLBACK_URL,
};

export function validateEnvironment() {
    const missing = required.filter(
        (key) => !process.env[key]
    );

    if (missing.length) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}`
        );
    }

    if (env.jwtSecret.length < 32) {
        throw new Error(
            'JWT_SECRET must be at least 32 characters.'
        );
    }
}