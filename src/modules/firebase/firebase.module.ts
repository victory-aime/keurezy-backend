import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FirebaseService } from './firebase.service';

/** Intégration Firebase Admin (infrastructure) : aucun module métier ne l'appelle directement. */
@Module({
  imports: [ConfigModule],
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}
