import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService {
  constructor(private readonly config: ConfigService) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.config.get<string>('FIREBASE_PROJECT_ID'),
          clientEmail: this.config.get<string>('FIREBASE_CLIENT_EMAIL'),
          privateKey: this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
        }),
      });
    }
  }

  getApp() {
    return admin.app();
  }

  getAuth() {
    return admin.auth();
  }

  getMessaging() {
    return admin.messaging();
  }
}
