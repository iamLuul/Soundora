// Termos de Uso, Política de Privacidade, Termo de responsáveis, cookies e anúncios do Soundora.
//
// RASCUNHO: escrito a partir do que o app faz hoje (dados guardados, serviços usados, regras de
// idade e exclusão de conta). Antes de publicar nas lojas, peça a revisão de um advogado e
// preencha LEGAL_CONTACT com o e-mail de contato do controlador dos dados (LGPD, art. 41).

/** E-mail de contato para privacidade e denúncias. null = ainda não definido (o texto avisa). */
export const LEGAL_CONTACT: string | null = null;
export const LEGAL_UPDATED_AT = '2026-10-12';

export type LegalDoc = 'terms' | 'privacy' | 'guardians' | 'cookies' | 'ads';
export const LEGAL_DOCS: LegalDoc[] = ['terms', 'privacy', 'guardians', 'cookies', 'ads'];
export interface LegalSection {
  title: string;
  paragraphs: string[];
}

const contactPt = LEGAL_CONTACT ? `Fale com a gente pelo e-mail ${LEGAL_CONTACT}.` : 'O e-mail de contato do Soundora será publicado aqui antes do lançamento.';
const contactEn = LEGAL_CONTACT ? `Contact us at ${LEGAL_CONTACT}.` : 'Soundora’s contact email will be published here before launch.';

const PT: Record<LegalDoc, LegalSection[]> = {
  terms: [
    {
      title: '1. O que é o Soundora',
      paragraphs: [
        'O Soundora é uma rede social para descobrir e compartilhar música. Você publica posts, reviews de álbuns e vibes, segue pessoas e ouve prévias de 30 segundos.',
        'O Soundora não toca músicas completas. Cada música abre no app de streaming que você escolher (Spotify, Apple Music, Deezer e outros).',
      ],
    },
    {
      title: '2. Quem pode usar',
      paragraphs: [
        'Você precisa ter pelo menos 13 anos. Contas de pessoas com menos de 16 anos precisarão do vínculo com um responsável; enquanto esse recurso não existir, essas idades não conseguem se cadastrar.',
        'Use dados verdadeiros no cadastro. A conta é pessoal: não a compartilhe nem venda.',
      ],
    },
    {
      title: '3. O que você publica',
      paragraphs: [
        'Posts, comentários, reviews, fotos, vídeos e vibes continuam sendo seus. Ao publicar, você permite que o Soundora mostre esse conteúdo a outras pessoas dentro do app.',
        'Não publique: discurso de ódio, assédio, conteúdo sexual, violência, spam, dados pessoais de outras pessoas ou material que viole direitos autorais.',
        'Links de música abrem as plataformas oficiais. Não use o Soundora para distribuir músicas sem autorização.',
      ],
    },
    {
      title: '4. Moderação',
      paragraphs: [
        'Qualquer pessoa pode denunciar um post, comentário, review, vibe ou perfil. A equipe analisa as denúncias e pode remover conteúdo ou suspender contas que quebrem estes termos.',
        'Você pode bloquear quem quiser. Quem está bloqueado não vê seu conteúdo, e você não vê o dessa pessoa.',
      ],
    },
    {
      title: '5. Sua conta',
      paragraphs: [
        'Você pode excluir sua conta a qualquer momento em Configurações › Excluir conta. Isso apaga seu perfil e tudo o que você publicou, e não dá para desfazer.',
        'O Soundora pode mudar ou encerrar funcionalidades. Mudanças importantes nestes termos serão avisadas no app.',
      ],
    },
    { title: '6. Contato', paragraphs: [contactPt] },
  ],
  privacy: [
    {
      title: '1. O que guardamos',
      paragraphs: [
        'Conta: e-mail, senha (guardada de forma criptografada pelo serviço de login), @usuário, nome, foto, banner, bio e idioma.',
        'Data de nascimento: só para aplicar as regras de idade. Ela nunca aparece no seu perfil.',
        'O que você faz no app: posts, comentários, reviews, vibes, fotos e vídeos, curtidas, quem você segue, gêneros escolhidos, músicas favoritas, músicas curtidas no Descobrir, bloqueios e denúncias.',
        'Aparelho: se você ativar os avisos no celular, guardamos o código do aparelho para enviar as notificações.',
      ],
    },
    {
      title: '2. Para que usamos',
      paragraphs: [
        'Para o app funcionar: mostrar seu perfil e conteúdo, montar o feed, sugerir músicas e contas pelo seu gosto, enviar notificações e aplicar limites contra spam.',
        'Para segurança e moderação: analisar denúncias, suspender contas que quebrem as regras e evitar abuso.',
        'Não vendemos seus dados e não usamos seus dados para anúncios.',
      ],
    },
    {
      title: '3. Quem vê o quê',
      paragraphs: [
        'Pessoas com conta no Soundora veem seu perfil público (nome, @, foto, banner, bio, gêneros, músicas favoritas) e o que você publica, menos quem você bloqueou ou quem bloqueou você.',
        'Seu e-mail e sua data de nascimento nunca são mostrados a outras pessoas.',
        'Vibes deixam de aparecer depois de 24 horas. Quem publicou vê quem viu a vibe.',
      ],
    },
    {
      title: '4. Serviços usados',
      paragraphs: [
        'Supabase: guarda os dados e cuida do login.',
        'Google e Apple: só se você escolher entrar com essas contas.',
        'Deezer, Apple Music, Last.fm e Songlink: dados das músicas (capa, prévia, gênero, links). Enviamos só o nome da música e do artista, nunca dados seus.',
        'Expo: entrega as notificações no celular, com o texto do aviso e o código do aparelho.',
      ],
    },
    {
      title: '5. Seus direitos (LGPD)',
      paragraphs: [
        'Você pode ver e corrigir seus dados no próprio app (Editar perfil e Configurações).',
        'Você pode excluir sua conta em Configurações › Excluir conta. Perfil, posts, comentários, reviews, curtidas, seguidores, bloqueios, foto e banner são apagados.',
        'Para outros pedidos (acesso, cópia dos dados, dúvidas), use o contato abaixo.',
      ],
    },
    {
      title: '6. Menores de idade',
      paragraphs: [
        'O Soundora é para quem tem 13 anos ou mais. Contas de quem tem menos de 16 precisarão de um responsável vinculado; enquanto isso não existir, essas idades não conseguem se cadastrar.',
      ],
    },
    { title: '7. Contato', paragraphs: [contactPt] },
  ],
  guardians: [
    {
      title: '1. Para quem é este termo',
      paragraphs: [
        'Para quem tem entre 13 e 17 anos e para o pai, a mãe ou o responsável legal dessa pessoa. Quem tem menos de 13 anos não pode usar o Soundora.',
        'Contas de quem tem menos de 16 anos precisarão do vínculo com um responsável; enquanto esse recurso não existir, essas idades não conseguem se cadastrar.',
      ],
    },
    {
      title: '2. O que o responsável precisa saber',
      paragraphs: [
        'O Soundora é uma rede social: o que a pessoa publica (posts, reviews, vibes, comentários) pode ser visto por outras pessoas. Recomendamos ativar a conta privada em Configurações › Privacidade, para que só seguidores aprovados vejam o conteúdo.',
        'A pessoa pode bloquear e denunciar quem quiser. Denúncias são analisadas pela equipe.',
        'O Soundora não tem compras dentro do app nem mostra anúncios.',
      ],
    },
    {
      title: '3. Dados de menores',
      paragraphs: [
        'Guardamos só o necessário para a conta funcionar (veja a Política de Privacidade). A data de nascimento serve só para aplicar as regras de idade e nunca aparece no perfil.',
        'Dados de menores não são usados para anúncios nem vendidos.',
        'O responsável pode pedir acesso, correção ou exclusão dos dados da pessoa pelo contato abaixo, e a própria pessoa pode excluir a conta em Configurações › Excluir conta.',
      ],
    },
    { title: '4. Contato', paragraphs: [contactPt] },
  ],
  cookies: [
    {
      title: '1. O que guardamos no navegador',
      paragraphs: [
        'Na versão Web, o Soundora guarda no seu navegador (armazenamento local) só o necessário para funcionar: a sessão de login, o idioma, as dicas que você já viu e as preferências de acessibilidade.',
        'No celular, as mesmas informações ficam guardadas no próprio aparelho; a sessão de login fica criptografada.',
      ],
    },
    {
      title: '2. O que não usamos',
      paragraphs: [
        'Não usamos cookies de publicidade, de rastreamento entre sites nem de análise de terceiros.',
        'As prévias de música vêm da Deezer e as capas, de serviços de música. Ao tocar uma prévia, o navegador busca o arquivo nesses serviços, que seguem as próprias políticas.',
      ],
    },
    {
      title: '3. Como apagar',
      paragraphs: ['Sair da conta apaga a sessão deste aparelho. Limpar os dados do site no navegador apaga todo o resto; você só precisa entrar de novo.'],
    },
    { title: '4. Contato', paragraphs: [contactPt] },
  ],
  ads: [
    {
      title: '1. Hoje',
      paragraphs: ['O Soundora não mostra anúncios. Nenhum post, review ou música é patrocinado.'],
    },
    {
      title: '2. Se um dia houver anúncios',
      paragraphs: [
        'Eles serão marcados como "Patrocinado" e você será avisado no app antes de começarem.',
        'Anúncios personalizados só com o seu consentimento, que poderá ser retirado a qualquer momento em Configurações.',
        'Nunca usaremos dados de menores de idade, mensagens, data de nascimento, gênero ou contas bloqueadas para escolher anúncios, nem venderemos seus dados.',
      ],
    },
    { title: '3. Contato', paragraphs: [contactPt] },
  ],
};

const EN: Record<LegalDoc, LegalSection[]> = {
  terms: [
    {
      title: '1. What Soundora is',
      paragraphs: [
        'Soundora is a social network to discover and share music. You publish posts, album reviews and vibes, follow people and listen to 30-second previews.',
        'Soundora doesn’t play full songs. Each song opens in the streaming app you choose (Spotify, Apple Music, Deezer and others).',
      ],
    },
    {
      title: '2. Who can use it',
      paragraphs: [
        'You must be at least 13. Accounts of people under 16 will need a linked guardian; until that feature exists, those ages can’t sign up.',
        'Use real information when signing up. Your account is personal: don’t share or sell it.',
      ],
    },
    {
      title: '3. What you publish',
      paragraphs: [
        'Posts, comments, reviews, photos, videos and vibes remain yours. By publishing, you allow Soundora to show this content to other people in the app.',
        'Don’t publish: hate speech, harassment, sexual content, violence, spam, other people’s personal data or material that infringes copyright.',
        'Music links open the official platforms. Don’t use Soundora to distribute music without permission.',
      ],
    },
    {
      title: '4. Moderation',
      paragraphs: [
        'Anyone can report a post, comment, review, vibe or profile. The team reviews reports and may remove content or suspend accounts that break these terms.',
        'You can block anyone. People you block can’t see your content, and you won’t see theirs.',
      ],
    },
    {
      title: '5. Your account',
      paragraphs: [
        'You can delete your account at any time in Settings › Delete account. This deletes your profile and everything you published, and can’t be undone.',
        'Soundora may change or end features. Important changes to these terms will be announced in the app.',
      ],
    },
    { title: '6. Contact', paragraphs: [contactEn] },
  ],
  privacy: [
    {
      title: '1. What we store',
      paragraphs: [
        'Account: email, password (stored encrypted by the sign-in service), @username, name, photo, banner, bio and language.',
        'Date of birth: only to apply age rules. It never appears on your profile.',
        'What you do in the app: posts, comments, reviews, vibes, photos and videos, likes, who you follow, chosen genres, favorite songs, songs liked in Discover, blocks and reports.',
        'Device: if you turn on phone notifications, we store the device code to send them.',
      ],
    },
    {
      title: '2. What we use it for',
      paragraphs: [
        'To make the app work: show your profile and content, build the feed, suggest songs and accounts based on your taste, send notifications and apply anti-spam limits.',
        'For safety and moderation: review reports, suspend accounts that break the rules and prevent abuse.',
        'We don’t sell your data and don’t use it for ads.',
      ],
    },
    {
      title: '3. Who sees what',
      paragraphs: [
        'People with a Soundora account see your public profile (name, @, photo, banner, bio, genres, favorite songs) and what you publish, except people you blocked or who blocked you.',
        'Your email and date of birth are never shown to other people.',
        'Vibes stop showing after 24 hours. Whoever posted sees who viewed the vibe.',
      ],
    },
    {
      title: '4. Services we use',
      paragraphs: [
        'Supabase: stores the data and handles sign-in.',
        'Google and Apple: only if you choose to sign in with those accounts.',
        'Deezer, Apple Music, Last.fm and Songlink: song data (cover, preview, genre, links). We only send song and artist names, never your data.',
        'Expo: delivers phone notifications, with the notification text and the device code.',
      ],
    },
    {
      title: '5. Your rights (LGPD)',
      paragraphs: [
        'You can see and correct your data in the app (Edit profile and Settings).',
        'You can delete your account in Settings › Delete account. Profile, posts, comments, reviews, likes, followers, blocks, photo and banner are deleted.',
        'For other requests (access, a copy of your data, questions), use the contact below.',
      ],
    },
    {
      title: '6. Minors',
      paragraphs: [
        'Soundora is for people 13 and older. Accounts of people under 16 will need a linked guardian; until that exists, those ages can’t sign up.',
      ],
    },
    { title: '7. Contact', paragraphs: [contactEn] },
  ],
  guardians: [
    {
      title: '1. Who these terms are for',
      paragraphs: [
        'People aged 13 to 17 and their parent or legal guardian. People under 13 can’t use Soundora.',
        'Accounts of people under 16 will need a linked guardian; until that feature exists, those ages can’t sign up.',
      ],
    },
    {
      title: '2. What the guardian needs to know',
      paragraphs: [
        'Soundora is a social network: what the person publishes (posts, reviews, vibes, comments) can be seen by other people. We recommend turning on the private account in Settings › Privacy, so only approved followers can see the content.',
        'The person can block and report anyone. Reports are reviewed by the team.',
        'Soundora has no in-app purchases and shows no ads.',
      ],
    },
    {
      title: '3. Data of minors',
      paragraphs: [
        'We only store what the account needs to work (see the Privacy Policy). The date of birth is only used to apply age rules and never appears on the profile.',
        'Data of minors is never used for ads or sold.',
        'The guardian can request access, correction or deletion of the person’s data through the contact below, and the person can delete the account in Settings › Delete account.',
      ],
    },
    { title: '4. Contact', paragraphs: [contactEn] },
  ],
  cookies: [
    {
      title: '1. What we store in your browser',
      paragraphs: [
        'On the Web, Soundora stores in your browser (local storage) only what it needs to work: your sign-in session, language, the tips you’ve seen and your accessibility preferences.',
        'On your phone, the same information is stored on the device itself; the sign-in session is encrypted.',
      ],
    },
    {
      title: '2. What we don’t use',
      paragraphs: [
        'We don’t use advertising cookies, cross-site tracking or third-party analytics.',
        'Music previews come from Deezer and covers from music services. When you play a preview, your browser fetches the file from those services, which follow their own policies.',
      ],
    },
    {
      title: '3. How to clear it',
      paragraphs: [
        'Signing out deletes the session from this device. Clearing the site data in your browser deletes everything else; you just need to sign in again.',
      ],
    },
    { title: '4. Contact', paragraphs: [contactEn] },
  ],
  ads: [
    {
      title: '1. Today',
      paragraphs: ['Soundora shows no ads. No post, review or song is sponsored.'],
    },
    {
      title: '2. If there are ever ads',
      paragraphs: [
        'They will be labeled "Sponsored" and you’ll be told in the app before they start.',
        'Personalized ads only with your consent, which you’ll be able to withdraw at any time in Settings.',
        'We will never use data of minors, messages, date of birth, gender or blocked accounts to choose ads, nor sell your data.',
      ],
    },
    { title: '3. Contact', paragraphs: [contactEn] },
  ],
};

export function legalSections(doc: LegalDoc, locale: string): LegalSection[] {
  return (locale === 'pt-BR' ? PT : EN)[doc];
}
