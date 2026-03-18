import { IsNotEmpty, IsString, MinLength } from 'class-validator'

export class ActivateInvitationDto {
  @IsString()
  @IsNotEmpty({ message: 'El token es requerido' })
  token!: string

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string
}
