import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class UpdateStaffPermissionsDto {
  @ApiProperty({ description: 'Membre (Staff.id) dont les permissions sont mises à jour' })
  @IsUUID()
  staffId: string;

  @ApiProperty({
    type: [String],
    description:
      'Liste complète des permissions accordées : elle remplace les précédentes (liste vide = aucune)',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  permissionIds: string[];
}
