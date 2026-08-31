import bcrypt from 'bcryptjs';
import { Schema, model, type HydratedDocument, type InferSchemaType, type Model, type Types } from 'mongoose';
import { env } from '../config/env.js';

/**
 * Dono do restaurante / comercio que cria a conta no VaptApp.
 *
 * Campos obrigatorios definidos no produto: e-mail, senha, nome de usuario,
 * endereco e foto de perfil. A foto vive na colecao `Image` (WEBP em base64);
 * aqui guardamos so a referencia.
 *
 * `passwordHash` tem `select: false`: nenhuma consulta traz o hash por acidente.
 * Para autenticar, use `User.findOne(...).select('+passwordHash')`.
 */

const addressSchema = new Schema(
  {
    zip: { type: String, trim: true, maxlength: 12, default: '' },
    street: { type: String, required: [true, 'Informe a rua.'], trim: true, maxlength: 140 },
    number: { type: String, required: [true, 'Informe o numero.'], trim: true, maxlength: 20 },
    complement: { type: String, trim: true, maxlength: 80, default: '' },
    district: { type: String, required: [true, 'Informe o bairro.'], trim: true, maxlength: 80 },
    city: { type: String, required: [true, 'Informe a cidade.'], trim: true, maxlength: 80 },
    state: {
      type: String,
      required: [true, 'Informe o estado (UF).'],
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
    },
    /** Referencia escrita pelo dono, util para a entrega e para o suporte. */
    reference: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false }
);

/** Metodos de instancia do usuario. */
export type UserMethods = {
  comparePassword(plain: string): Promise<boolean>;
};

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Informe o e-mail.'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'E-mail invalido.'],
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      maxlength: [40, 'O nome de usuario pode ter no maximo 40 caracteres.'],
      match: [/^[a-z0-9._-]*$/, 'Use apenas letras, numeros, ponto, hifen e underline.'],
    },
    /** Nome de exibicao (o nome da pessoa ou do restaurante). */
    displayName: { type: String, trim: true, maxlength: 80, default: '' },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    address: { type: addressSchema, required: true },
    photo: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    role: { type: String, enum: ['owner', 'admin'], default: 'owner' },
    status: { type: String, enum: ['ativo', 'suspenso'], default: 'ativo' },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

/** URL da foto para o front consumir direto no <img src>. */
userSchema.virtual('photoUrl').get(function photoUrl(this: { photo?: Types.ObjectId | null }) {
  return this.photo ? `/api/images/${String(this.photo)}` : null;
});

userSchema.methods.comparePassword = function comparePassword(this: { passwordHash?: string }, plain: string) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

/** Gera o hash da senha. Fica no model para o custo (rounds) viver num lugar so. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.auth.bcryptRounds);
}

type UserSchemaType = InferSchemaType<typeof userSchema>;
type UserModel = Model<UserSchemaType, Record<string, never>, UserMethods>;

export type UserDoc = HydratedDocument<UserSchemaType, UserMethods> & { _id: Types.ObjectId };

export const User = model<UserSchemaType, UserModel>('User', userSchema);
