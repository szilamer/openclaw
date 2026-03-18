import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class EmailIntakeDto {
  @ApiProperty()
  @IsString()
  from: string;

  @ApiProperty()
  @IsString()
  to: string;

  @ApiProperty()
  @IsString()
  subject: string;

  @ApiProperty()
  @IsString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiProperty()
  @IsString()
  source_uid: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  auto_create_task?: boolean;

  @ApiPropertyOptional({ description: 'Explicit project ID override. If omitted, auto-routing by sender email is used.' })
  @IsOptional()
  @IsString()
  projectId?: string;
}
