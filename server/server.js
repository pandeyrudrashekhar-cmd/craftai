import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, validateEnvironment } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import versionRoutes from './routes/versionRoutes.js';
import deploymentRoutes from './routes/deploymentRoutes.js';
import githubRoutes from './routes/githubRoutes.js';
import { getPublishedProject } from './controllers/deploymentController.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { recoverBuildingDeployments } from './controllers/deploymentController.js';

validateEnvironment();
const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests without an Origin
        // and requests from our frontend URLs
        if (!origin || env.clientUrls.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    allowedHeaders: ['Content-Type', 'Authorization'],

    credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', chatRoutes);
app.use('/api/projects', fileRoutes);
app.use('/api/projects', versionRoutes);
app.get('/published/:deploymentId', getPublishedProject);
app.use('/api/projects', deploymentRoutes);
app.use('/api/github', githubRoutes);
app.use(notFound); app.use(errorHandler);
app.listen(env.port, () => {
    console.log(`API listening on port ${env.port}`);
    recoverBuildingDeployments().catch((error) => console.error('Deployment recovery failed:', error.message));
});
