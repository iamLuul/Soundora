import { z } from 'zod';

/** Nome de usuário: 3 a 20 caracteres, letras minúsculas, números, "_" e ".". */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'username_too_short')
  .max(20, 'username_too_long')
  .regex(/^[a-z0-9_.]+$/, 'username_invalid_chars')
  .refine((v) => !v.startsWith('.') && !v.endsWith('.') && !v.includes('..'), 'username_invalid_dots');

export const displayNameSchema = z.string().trim().min(1, 'display_name_required').max(50, 'display_name_too_long');

export const POST_TEXT_MAX = 500;
export const postTextSchema = z.string().trim().max(POST_TEXT_MAX, 'post_text_too_long');

export const COMMENT_MAX = 300;
export const commentSchema = z.string().trim().min(1, 'comment_required').max(COMMENT_MAX, 'comment_too_long');

/** Gêneros do onboarding (mesmos slugs da tabela `genres`). */
export const GENRES = [
  'acoustic',
  'alternative',
  'ambient',
  'anime',
  'blues',
  'bossa_nova',
  'classical',
  'country',
  'dance',
  'drum_and_bass',
  'electronic',
  'emo',
  'folk',
  'forro',
  'funk_br',
  'gospel',
  'hip_hop',
  'house',
  'indie',
  'jazz',
  'k_pop',
  'latin',
  'lo_fi',
  'metal',
  'mpb',
  'pagode',
  'pop',
  'punk',
  'r_and_b',
  'reggae',
  'rock',
  'samba',
  'sertanejo',
  'shoegaze',
  'soul',
  'techno',
  'trap',
] as const;
export type Genre = (typeof GENRES)[number];

export const MIN_GENRES = 3;
/** Slug de gênero (o catálogo tem milhares; a existência é conferida no banco). */
export const GENRE_SLUG_RE = /^[a-z0-9_]{1,80}$/;
export const genresSchema = z
  .array(z.string().regex(GENRE_SLUG_RE, 'genre_invalid'))
  .min(MIN_GENRES, 'genres_too_few')
  .max(10, 'genres_too_many');

export const birthdateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'birthdate_invalid');

export const reportReasonSchema = z.enum(['spam', 'harassment', 'hate', 'sexual', 'violence', 'copyright', 'other']);
export type ReportReason = z.infer<typeof reportReasonSchema>;

/** Senha: 8 a 72 caracteres (72 é o limite do bcrypt usado pelo Supabase Auth). */
// Igual ao supabase/config.toml (minimum_password_length e password_requirements = "letters_digits").
// 72 é o limite do bcrypt, o algoritmo com que o Supabase guarda o hash da senha.
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, 'password_too_short')
  .max(PASSWORD_MAX, 'password_too_long')
  .refine((p) => /\p{L}/u.test(p) && /\d/.test(p), 'password_needs_letters_digits');
