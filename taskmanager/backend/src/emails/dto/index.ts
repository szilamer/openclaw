import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';

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

/** Agent (Sophon): staged email + optional OpenAI classification result */
export class TriageRegisterDto {
  @ApiProperty()
  @IsString()
  source_uid: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mailbox?: string;

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

  @ApiPropertyOptional({ description: 'Full body after download from IMAP' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  suggested_project_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  llm_model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  llm_rationale?: string;
}

export class TriageReviewDto {
  @ApiProperty({ enum: ['approve', 'reject', 'set_project'] })
  @IsIn(['approve', 'reject', 'set_project'])
  action: 'approve' | 'reject' | 'set_project';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolved_project_id?: string;
}

export class TriageRuleCreateDto {
  @ApiProperty({
    description:
      'sender_email | sender_domain | subject_contains | body_contains | regex_subject',
  })
  @IsString()
  kind: string;

  @ApiProperty()
  @IsString()
  pattern: string;

  @ApiProperty()
  @IsString()
  project_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  created_from_triage_id?: string;
}

export class TriageRulePatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pattern?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  project_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
}
