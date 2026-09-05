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
      trim: true,
      minlength: [4, 'O nome de usuario deve ter no minimo 4 caracteres.'],
      maxlength: [24, 'O nome de usuario pode ter no maximo 24 caracteres.'],
      match: [/^[a-zA-Z0-9._]+$/, 'Use apenas letras, numeros, ponto e underline.'],
    },
    /** Nome de exibicao (o nome da pessoa ou do restaurante). */
    displayName: { type: String, trim: true, maxlength: 80, default: '' },
    /**
     * Conta criada pelo Google nao tem senha. `required` vira funcao: so
     * exige hash quando NAO ha googleId. Quem entrou pelo Google pode definir
     * uma senha depois — dai passa a ter os dois caminhos de login.
     */
    passwordHash: {
      type: String,
      required: function (this: { googleId?: string | null }) {
        return !this.googleId;
      },
      select: false,
    },
    /**
     * Mesma logica do endereco: no primeiro acesso pelo Google ainda nao
     * temos os dados da loja. O onboarding preenche antes de liberar o painel.
     */
    address: {
      type: addressSchema,
      required: function (this: { googleId?: string | null }) {
        return !this.googleId;
      },
    },
    photo: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    role: { type: String, enum: ['owner', 'admin'], default: 'owner' },
    status: { type: String, enum: ['ativo', 'suspenso'], default: 'ativo' },
    isAdmin: { type: Boolean, default: false },
    plan: { type: String, default: null },
    planStartDate: { type: Date, default: null },
    planEndDate: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },

    /* ---------------------- Login com Google ---------------------- */

    /** `sub` do Google: identificador estavel, nao muda se o e-mail mudar. */
    googleId: { type: String, default: null, unique: true, sparse: true, index: true },
    /**
     * Como esta conta consegue entrar hoje:
     *   local  -> so senha
     *   google -> so Google
     *   both   -> os dois (conta local que vinculou o Google, ou o inverso)
     */
    authProvider: { type: String, enum: ['local', 'google', 'both'], default: 'local' },
    /**
     * Foto vinda do Google (URL externa do googleusercontent).
     * Fica separada de `photo`, que aponta para a colecao Image: se o dono
     * subir uma foto propria depois, ela tem precedencia e esta continua aqui
     * como fallback, sem precisar baixar nada.
     */
    avatarUrl: { type: String, trim: true, maxlength: 400, default: '' },
    /** Falso ate o lojista completar os dados da loja na tela de onboarding. */
    onboardingCompleted: { type: Boolean, default: true },

    /* ------------------- Consentimento juridico ------------------- */

    /**
     * Quando o usuario aceitou os Termos. Guardamos a DATA, nao um booleano:
     * o que vale juridicamente e conseguir provar *quando* houve o aceite,
     * e a data ainda permite pedir novo aceite quando os termos mudarem.
     */
    termsAcceptedAt: { type: Date, default: null },

    /* -------------------- Recuperacao de senha -------------------- */

    /**
     * HASH do codigo de 6 digitos, nunca o codigo em si.
     * Sao apenas 10^6 combinacoes: em texto puro, quem lesse o banco poderia
     * tomar qualquer conta. `select: false` mantem o campo fora das consultas
     * comuns, do mesmo jeito que o passwordHash.
     */
    resetPasswordCode: { type: String, default: null, select: false },
    resetPasswordExpires: { type: Date, default: null, select: false },
    /** Tentativas erradas do codigo atual. Trava o codigo antes da forca bruta. */
    resetPasswordAttempts: { type: Number, default: 0, select: false },
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
  return this.photo ? `${env.publicUrl}/api/images/${String(this.photo)}` : null;
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
