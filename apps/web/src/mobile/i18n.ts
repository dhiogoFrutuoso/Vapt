import type { Idioma } from './preferences';

/**
 * Textos do aplicativo da equipe.
 *
 * Dicionário simples, sem biblioteca: são poucas telas e nenhuma delas tem
 * plural, gênero variável ou data formatada por região. Trazer uma biblioteca
 * de i18n aqui adicionaria peso ao bundle que roda dentro do APK sem resolver
 * um problema que exista.
 *
 * O `pt-BR` é a referência: as outras línguas se comparam a ele. O tipo
 * `Chave` é derivado do próprio pt-BR, então esquecer uma tradução vira erro
 * de compilação em vez de um texto faltando na tela do funcionário.
 */

const ptBR = {
  'perfil.titulo': 'Meu perfil',
  'perfil.dados': 'Meus dados',
  'perfil.telefone': 'Telefone',
  'perfil.cpf': 'CPF',
  'perfil.nascimento': 'Nascimento',
  'perfil.editar': 'Editar dados',
  'perfil.sair': 'Sair da conta',
  'perfil.saindo': 'Saindo...',
  'perfil.saiu': 'Você saiu da conta.',

  'prefs.titulo': 'Preferências',
  'prefs.descricao': 'Valem só neste aparelho. Cada pessoa da equipe tem as suas.',
  'prefs.tema': 'Aparência',
  'prefs.tema.claro': 'Claro',
  'prefs.tema.escuro': 'Escuro',
  'prefs.tema.sistema': 'Automático',
  'prefs.tema.ajuda': 'Automático segue a configuração do aparelho.',
  'prefs.escala': 'Tamanho da interface',
  'prefs.escala.ajuda': 'Aumenta texto, botões e espaçamentos juntos.',
  'prefs.escala.restaurar': 'Restaurar padrão',
  'prefs.idioma': 'Idioma',
  'prefs.salvo': 'Preferência salva neste aparelho.',

  'nav.areas': 'Áreas do aplicativo',
  'abas.cliente': 'Cliente',
  'abas.recepcao': 'Recepção',
  'abas.salao': 'Salão',
  'abas.cozinha': 'Cozinha',
  'abas.caixa': 'Caixa',
  'abas.entregador': 'Entregador',
  'abas.aviso': 'Sua função dá acesso a esta área. As telas de operação chegam na próxima etapa.',
} as const;

export type Chave = keyof typeof ptBR;

const en: Record<Chave, string> = {
  'perfil.titulo': 'My profile',
  'perfil.dados': 'My details',
  'perfil.telefone': 'Phone',
  'perfil.cpf': 'Tax ID',
  'perfil.nascimento': 'Date of birth',
  'perfil.editar': 'Edit details',
  'perfil.sair': 'Sign out',
  'perfil.saindo': 'Signing out...',
  'perfil.saiu': 'You have signed out.',

  'prefs.titulo': 'Preferences',
  'prefs.descricao': 'These apply to this device only. Each team member has their own.',
  'prefs.tema': 'Appearance',
  'prefs.tema.claro': 'Light',
  'prefs.tema.escuro': 'Dark',
  'prefs.tema.sistema': 'Automatic',
  'prefs.tema.ajuda': 'Automatic follows the device setting.',
  'prefs.escala': 'Interface size',
  'prefs.escala.ajuda': 'Scales text, buttons and spacing together.',
  'prefs.escala.restaurar': 'Reset to default',
  'prefs.idioma': 'Language',
  'prefs.salvo': 'Preference saved on this device.',

  'nav.areas': 'App areas',
  'abas.cliente': 'Customer',
  'abas.recepcao': 'Front desk',
  'abas.salao': 'Dining room',
  'abas.cozinha': 'Kitchen',
  'abas.caixa': 'Register',
  'abas.entregador': 'Courier',
  'abas.aviso': 'Your role grants access to this area. The operating screens arrive in the next release.',
};

const es: Record<Chave, string> = {
  'perfil.titulo': 'Mi perfil',
  'perfil.dados': 'Mis datos',
  'perfil.telefone': 'Teléfono',
  'perfil.cpf': 'Documento',
  'perfil.nascimento': 'Fecha de nacimiento',
  'perfil.editar': 'Editar datos',
  'perfil.sair': 'Cerrar sesión',
  'perfil.saindo': 'Cerrando...',
  'perfil.saiu': 'Has cerrado la sesión.',

  'prefs.titulo': 'Preferencias',
  'prefs.descricao': 'Valen solo en este dispositivo. Cada persona tiene las suyas.',
  'prefs.tema': 'Apariencia',
  'prefs.tema.claro': 'Claro',
  'prefs.tema.escuro': 'Oscuro',
  'prefs.tema.sistema': 'Automático',
  'prefs.tema.ajuda': 'Automático sigue la configuración del dispositivo.',
  'prefs.escala': 'Tamaño de la interfaz',
  'prefs.escala.ajuda': 'Aumenta texto, botones y espaciados a la vez.',
  'prefs.escala.restaurar': 'Restaurar predeterminado',
  'prefs.idioma': 'Idioma',
  'prefs.salvo': 'Preferencia guardada en este dispositivo.',

  'nav.areas': 'Áreas de la aplicación',
  'abas.cliente': 'Cliente',
  'abas.recepcao': 'Recepción',
  'abas.salao': 'Salón',
  'abas.cozinha': 'Cocina',
  'abas.caixa': 'Caja',
  'abas.entregador': 'Repartidor',
  'abas.aviso': 'Tu función da acceso a esta área. Las pantallas de operación llegan en la próxima etapa.',
};

const DICIONARIOS: Record<Idioma, Record<Chave, string>> = {
  'pt-BR': ptBR,
  en,
  es,
};

/** Nome de cada idioma na própria língua — é assim que se reconhece o seu. */
export const NOMES_IDIOMA: Record<Idioma, string> = {
  'pt-BR': 'Português (Brasil)',
  en: 'English',
  es: 'Español',
};

export function traduzir(idioma: Idioma, chave: Chave): string {
  return DICIONARIOS[idioma]?.[chave] ?? ptBR[chave];
}
