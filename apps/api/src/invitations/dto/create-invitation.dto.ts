import { IsEmail, IsNotEmpty, IsEnum } from 'class-validator'
import { Role } from '@eval/shared'

export class CreateInvitationDto {
  @IsEmail({}, { message: 'El correo debe ser válido' })
  @IsNotEmpty({ message: 'El correo es requerido' })
  email!: string

  @IsEnum(Role, { message: 'El rol debe ser ADMIN, INTERNAL_ALKOSTO o YALO_READER' })
  role!: Role
}
