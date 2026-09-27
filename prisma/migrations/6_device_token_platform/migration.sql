-- Canal d'envoi des notifications push : FCM (web, valeur par défaut des jetons existants)
-- ou service Expo Push (mobile).
ALTER TABLE "device_tokens" ADD COLUMN "platform" "PushPlatform" NOT NULL DEFAULT 'WEB';
