import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentStatus } from 'prisma/generated/enums';
import { UploadsService } from './uploads.service';
import { CloudinaryService } from './cloudinary.service';
import { PrismaService } from '../../database/prisma.service';
import { CLOUDINARY_FOLDER_NAME } from '../../config/enum';

@Injectable()
export class UploadRecoveryCron {
  private readonly logger = new Logger(UploadRecoveryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  //@Cron(CronExpression.EVERY_30_SECONDS)
  async handleRecovery() {
    this.logger.log('🔄 CRON upload recovery started');

    // 1. récupérer transactions payées
    const transactions = await this.prisma.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.PAID,
      },
    });

    const filtered = transactions.filter((tx) => {
      const meta = tx.metadata as any;
      return meta?.uploadSessionId;
    });

    for (const tx of filtered) {
      try {
        const meta = tx.metadata as any;

        if (!meta?.uploadSessionId) continue;

        const tempFolder = `${CLOUDINARY_FOLDER_NAME.TEMP}/${meta.uploadSessionId}`;

        this.logger.log(`Checking folder: ${tempFolder}`);

        // 2. vérifier s'il reste des fichiers temp
        const tempFiles = await this.cloudinaryService.listFiles(tempFolder);

        this.logger.warn(`Found ${tempFiles.length} temp files`);
        if (!tempFiles?.length) {
          continue;
        }

        this.logger.warn(
          `⚠️ Fichiers temp détectés pour session ${meta.uploadSessionId} → récupération`,
        );

        // 3. move fichiers
        const moveResult = await this.uploadsService.moveTempToFinal(
          meta.uploadSessionId,
          meta.agencyName,
        );

        // 4. récupérer fichiers final
        const finalFolder = `${CLOUDINARY_FOLDER_NAME.AGENCY}/${this.sanitize(meta.agencyName)}/${CLOUDINARY_FOLDER_NAME.DOC}`;

        const finalFiles = await this.cloudinaryService.listFiles(finalFolder);

        const finalUrls = finalFiles.map((f) => f.secure_url);

        // 5. récupérer agence
        const agency = await this.prisma.agency.findFirst({
          where: {
            email: meta.agencyEmail,
          },
        });

        if (!agency) {
          this.logger.warn(`Agence introuvable pour ${meta.agencyEmail}`);
          continue;
        }

        // 6. update propre
        await this.prisma.agency.update({
          where: {
            id: agency.id,
          },
          data: {
            documents: finalUrls,
          },
        });

        this.logger.log(
          `✅ Recovery OK — session: ${meta.uploadSessionId}, moved: ${moveResult.moved}`,
        );
      } catch (err) {
        this.logger.error(`❌ Recovery failed for tx ${tx.id}`, err);
        // ne pas throw → continue
      }
    }

    this.logger.log('✅ CRON upload recovery finished');
  }

  private sanitize(name: string) {
    return name.replace(/\s+/g, '-').toLowerCase();
  }
}
