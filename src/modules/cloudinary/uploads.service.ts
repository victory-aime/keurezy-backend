import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { CLOUDINARY_FOLDER_NAME } from '../../config/enum';
import { randomUUID } from 'crypto';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  constructor(private readonly cloudinary: CloudinaryService) {}

  /**
   * Génère un nom unique basé sur :
   * nom original nettoyé
   * timestamp
   * petit suffixe aléatoire
   */
  private generateUniqueFilename(originalName: string): string {
    const ext = originalName.split('.').pop()?.toLowerCase();

    const nameWithoutExt = originalName.split('.').slice(0, -1).join('.');
    const sanitized = nameWithoutExt
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-_]/g, '')
      .toLowerCase();

    return `${sanitized}-${randomUUID()}.${ext}`;
  }

  private getResourceType(mimetype: string): 'image' | 'raw' {
    if (mimetype.startsWith('image/')) {
      return 'image';
    }
    return 'raw';
  }

  private sanitizeName(name: string): string {
    return name.replace(/\s+/g, '-').toLowerCase();
  }
  async uploadAgencyFile(params: {
    file: Express.Multer.File;
    agencyName?: string;
    folderName: string;
    uploadSessionId?: string;
    isTemp: boolean;
  }) {
    const { file, agencyName, folderName, uploadSessionId, isTemp } = params;

    if (!file?.originalname) {
      throw new BadRequestException('Fichier invalide');
    }

    const filename = this.generateUniqueFilename(file.originalname);
    const resourceType = this.getResourceType(file.mimetype);

    let folderPath: string;

    if (isTemp) {
      if (!uploadSessionId) {
        throw new BadRequestException('Session upload invalide');
      }

      folderPath = `${CLOUDINARY_FOLDER_NAME.TEMP}/${uploadSessionId}/${folderName}`;
    } else {
      if (!agencyName) {
        throw new BadRequestException('Nom agence requis');
      }

      const agence = this.sanitizeName(agencyName);
      folderPath = `${CLOUDINARY_FOLDER_NAME.AGENCY}/${agence}/${folderName}`;
    }

    return this.cloudinary.uploadFile(file.buffer, filename, folderPath, resourceType);
  }
  async uploadFiles(file: Express.Multer.File, agencyName: string, folderName: string) {
    if (!file?.originalname) {
      throw new BadRequestException('Fichier invalide');
    }

    const agence = this.sanitizeName(agencyName);
    const folderPath = `${CLOUDINARY_FOLDER_NAME.AGENCY}/${agence}/${folderName}`;
    const filename = this.generateUniqueFilename(file.originalname);

    const resourceType = this.getResourceType(file.mimetype);

    return this.cloudinary.uploadFile(file.buffer, filename, folderPath, resourceType);
  }

  async uploadUserImage(file: Express.Multer.File, userId: string) {
    if (!file?.originalname) {
      throw new BadRequestException('Aucun fichier reçu ou fichier invalide');
    }

    const folderPath = `${CLOUDINARY_FOLDER_NAME.USERS}/${userId}`;
    const filename = this.generateUniqueFilename(file.originalname);

    return this.cloudinary.uploadFile(file.buffer, filename, folderPath, 'image');
  }

  async deleteUserImage(userId: string): Promise<void> {
    const folderPath = `${CLOUDINARY_FOLDER_NAME.USERS}/${userId}`;
    await this.cloudinary.deleteFolder(folderPath);
  }

  async moveTempToFinal(uploadSessionId: string, agencyName: string) {
    if (!uploadSessionId) {
      throw new BadRequestException('Session upload invalide');
    }

    const agence = this.sanitizeName(agencyName);

    const tempFolder = `${CLOUDINARY_FOLDER_NAME.TEMP}/${uploadSessionId}/`;
    const finalFolder = `${CLOUDINARY_FOLDER_NAME.AGENCY}/${agence}/${CLOUDINARY_FOLDER_NAME.DOC}`;

    // 1. récupérer les fichiers temp
    const files = await this.cloudinary.listFiles(tempFolder);

    if (!files?.length) {
      throw new BadRequestException('Aucun fichier à valider');
    }

    // 2. déplacer fichier par fichier
    await Promise.all(
      files.map((file) =>
        this.cloudinary.moveFile(file.public_id, finalFolder, file.resource_type),
      ),
    );

    // 3. cleanup temp
    await this.deleteTempSession(uploadSessionId);

    this.logger.log('files moved', files?.length, 'destination', finalFolder);
    return {
      moved: files.length,
      destination: finalFolder,
    };
  }

  async deleteTempSession(uploadSessionId: string) {
    if (!uploadSessionId) return;

    const folderPath = `${CLOUDINARY_FOLDER_NAME.TEMP}/${uploadSessionId}`;
    await this.cloudinary.deleteFolder(folderPath);
  }
}
