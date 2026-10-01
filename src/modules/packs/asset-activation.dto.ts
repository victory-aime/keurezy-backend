import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsNotEmpty } from 'class-validator';
import { ASSET_TYPES, AssetType } from './asset-activation';

export class ActivateAssetDto {
  @ApiProperty({ enum: ASSET_TYPES })
  @IsIn(ASSET_TYPES)
  type: AssetType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id: string;
}
