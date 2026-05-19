import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as figlet from 'figlet';
import * as express from 'express';
import { LoadEnvironmentVariables } from './config/env';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { setupSwagger } from './config/swagger';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { toNodeHandler } from 'better-auth/node';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  console.log('\n========== PROJECT ENV ==========');

  const projectEnvs = [
    'NODE_ENV',

    // Database
    'DATABASE_URL',
    'DIRECT_URL',
    'SUPABASE_DB_PASSWORD',

    // Google
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',

    // Cloudinary
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',

    // Better Auth
    'BETTER_AUTH_URL',
    'BETTER_AUTH_SECRET',

    // App
    'APP_NAME',
    'WEB_APP_URL',
    'PORT',

    // Front URLs
    'FRONTEND_EMAIL_VERIFIED_URL',
    'FRONTEND_RESET_PASSWORD_URL',
    'FRONTEND_VERIFY_INVITATION_URL',
    'FRONTEND_UPDATE_VERIFIED_URL',

    // Resend
    'RESEND_TEMPLATE_TEAM_INVITE_ID',
    'RESEND_TEMPLATE_EMAIL_VERIFY_ID',
    'RESEND_TEMPLATE_RESET_PASSWORD_ID',
    'RESEND_TEMPLATE_UPDATE_EMAIL_ID',
    'RESEND_CLIENT_EMAIL',
    'RESEND_API_KEY',

    // Invitation
    'INVITATION_ENCRYPTION_KEY',

    // Cookies
    'COOKIE_DOMAIN',
  ];

  projectEnvs.forEach((key) => {
    const value = process.env[key];

    const shouldHide =
      key.includes('SECRET') ||
      key.includes('PASSWORD') ||
      key.includes('TOKEN') ||
      key.includes('KEY') ||
      key.includes('DATABASE_URL') ||
      key.includes('DIRECT_URL');

    console.log(`${key}=${shouldHide ? '********' : (value ?? 'undefined')}`);
  });

  console.log('=================================\n');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Access Express instance
  const expressApp = app.getHttpAdapter().getInstance();

  // Access BetterAuth instance from AuthService
  const authService = app.get<AuthService>(AuthService);

  expressApp.use((req, res, next) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5080',
      'http://localhost:8082',
      'https://vlpgtcwk-5080.euw.devtunnels.ms',
      'https://vlpgtcwk-3000.euw.devtunnels.ms',
      'exp://',
      'exp://**',
      'exp://192.168.*.*:*/**',
      'http://localhost:8081',
      'https://keurezy.onrender.com',
    ];

    const origin = req.headers.origin;

    const isAllowed =
      !!origin &&
      (allowedOrigins.includes(origin) ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://10.20.') || // ← ajouter
        origin.startsWith('exp://') || // ← ajouter
        origin.startsWith('keureazy://') ||
        origin.includes('.devtunnels.ms'));

    if (isAllowed) {
      res.header('Access-Control-Allow-Origin', origin);
    }

    res.header('Access-Control-Allow-Credentials', 'true');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  // Mount BetterAuth before body parsers
  expressApp.all(/^\/api\/auth\/.*/, toNodeHandler(authService.instance.handler));

  // Re-enable Nest's JSON body parser AFTER mounting BetterAuth
  expressApp.use(express.json());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  setupSwagger(app);

  await app.listen(process.env.PORT!, async () => {
    figlet(`${new Date().getFullYear()}- MyImmo`, (_, data) => {
      console.log('\x1b[1m\x1b[32m%s\x1b[0m', data);
      figlet('Powered By VICTORY', { font: 'Small' }, (a, res) =>
        console.log('\x1b[35m%s\x1b[0m', res),
      );
    });
  });
}
bootstrap();
