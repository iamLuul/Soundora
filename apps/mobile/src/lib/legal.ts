// Termos de Uso, Política de Privacidade, Termo de responsáveis, cookies e anúncios do Soundhora.
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

const contactPt = LEGAL_CONTACT
  ? `Fale com a gente pelo e-mail ${LEGAL_CONTACT}.`
  : 'O e-mail de contato do Soundhora será publicado aqui antes do lançamento.';
const contactEn = LEGAL_CONTACT ? `Contact us at ${LEGAL_CONTACT}.` : 'Soundhora’s contact email will be published here before launch.';

const PT: Record<LegalDoc, LegalSection[]> = {
  terms: [
    {
      title: '1. O que é o Soundhora',
      paragraphs: [
        'O Soundhora é uma rede social para descobrir e compartilhar música. Você publica posts, reviews de álbuns e vibes, segue pessoas e ouve prévias de 30 segundos.',
        'O Soundhora não toca músicas completas. Cada música abre no app de streaming que você escolher (Spotify, Apple Music, Deezer e outros).',
      ],
    },
    {
      title: '2. Quem pode usar',
      paragraphs: [
        'Você precisa ter pelo menos 16 anos. Quem tem menos de 16 anos não consegue se cadastrar, porque a lei exige o vínculo da conta com um responsável, e o Soundhora ainda não oferece esse recurso.',
        'Use dados verdadeiros no cadastro. A conta é pessoal: não a compartilhe nem venda.',
      ],
    },
    {
      title: '3. O que você publica',
      paragraphs: [
        'Posts, comentários, reviews, fotos, vídeos e vibes continuam sendo seus. Ao publicar, você permite que o Soundhora mostre esse conteúdo a outras pessoas dentro do app.',
        'Não publique: discurso de ódio, assédio, conteúdo sexual, violência, spam, dados pessoais de outras pessoas ou material que viole direitos autorais.',
        'Links de música abrem as plataformas oficiais. Não use o Soundhora para distribuir músicas sem autorização.',
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
        'O Soundhora pode mudar ou encerrar funcionalidades. Mudanças importantes nestes termos serão avisadas no app.',
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
        'Pesquisas: o texto do que você pesquisa (sem acento), por 90 dias e no máximo as 100 últimas, para recomendar posts e reviews. Você vê, apaga e desliga em Configurações › Privacidade › Histórico de pesquisas; desligar apaga tudo.',
        'Aparelho: se você ativar os avisos no celular, guardamos o código do aparelho para enviar as notificações.',
      ],
    },
    {
      title: '2. Para que usamos',
      paragraphs: [
        'Para o app funcionar: mostrar seu perfil e conteúdo, montar o feed, sugerir músicas, reviews e contas pelo seu gosto, enviar notificações e aplicar limites contra spam.',
        'O seu gosto é calculado pelo servidor a partir dos gêneros, artistas e palavras do que você curte, posta, comenta e pesquisa, das músicas curtidas no Descobrir e dos gêneros de quem você segue. Ele só serve para ordenar o que aparece para você: ninguém mais vê e ele não é usado para anúncios.',
        'Para segurança e moderação: analisar denúncias, suspender contas que quebrem as regras e evitar abuso.',
        'Não vendemos seus dados e não usamos seus dados para escolher anúncios (os anúncios do app do celular não são personalizados; veja a página Anúncios).',
      ],
    },
    {
      title: '3. Quem vê o quê',
      paragraphs: [
        'Pessoas com conta no Soundhora veem seu perfil público (nome, @, foto, banner, bio, gêneros, músicas favoritas) e o que você publica, menos quem você bloqueou ou quem bloqueou você.',
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
        'Google AdMob: anúncios no app do celular. O SDK do Google recebe dados técnicos do aparelho e da conexão (como endereço IP e identificador de publicidade), nunca dados da sua conta. Veja a página Anúncios.',
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
        'O Soundhora é para quem tem 16 anos ou mais. Quem tem menos de 16 não consegue se cadastrar, porque a lei exige o vínculo da conta com um responsável, e o Soundhora ainda não oferece esse recurso.',
      ],
    },
    { title: '7. Contato', paragraphs: [contactPt] },
  ],
  guardians: [
    {
      title: '1. Para quem é este termo',
      paragraphs: ['Para quem tem 16 ou 17 anos e para o pai, a mãe ou o responsável legal dessa pessoa. Quem tem menos de 16 anos não pode usar o Soundhora.'],
    },
    {
      title: '2. O que o responsável precisa saber',
      paragraphs: [
        'O Soundhora é uma rede social: o que a pessoa publica (posts, reviews, vibes, comentários) pode ser visto por outras pessoas. Recomendamos ativar a conta privada em Configurações › Privacidade, para que só seguidores aprovados vejam o conteúdo.',
        'A pessoa pode bloquear e denunciar quem quiser. Denúncias são analisadas pela equipe.',
        'O Soundhora não tem compras dentro do app. No app do celular podem aparecer anúncios, sempre com o selo "Patrocinado", nunca personalizados e só os adequados para adolescentes.',
      ],
    },
    {
      title: '3. Dados de menores',
      paragraphs: [
        'Guardamos só o necessário para a conta funcionar (veja a Política de Privacidade). A data de nascimento serve só para aplicar as regras de idade e nunca aparece no perfil.',
        'Dados de menores não são usados para escolher anúncios nem vendidos.',
        'O responsável pode pedir acesso, correção ou exclusão dos dados da pessoa pelo contato abaixo, e a própria pessoa pode excluir a conta em Configurações › Excluir conta.',
      ],
    },
    { title: '4. Contato', paragraphs: [contactPt] },
  ],
  cookies: [
    {
      title: '1. O que guardamos no navegador',
      paragraphs: [
        'Na versão Web, o Soundhora guarda no seu navegador (armazenamento local) só o necessário para funcionar: a sessão de login, o idioma, as dicas que você já viu e as preferências de acessibilidade.',
        'No celular, as mesmas informações ficam guardadas no próprio aparelho; a sessão de login fica criptografada.',
      ],
    },
    {
      title: '2. O que não usamos',
      paragraphs: [
        'Na versão Web, não usamos cookies de publicidade, de rastreamento entre sites nem de análise de terceiros. No app do celular, os anúncios seguem a página Anúncios.',
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
      title: '1. Onde aparecem',
      paragraphs: [
        'No app do celular (Android e iOS), o Soundhora pode mostrar anúncios entre os posts do feed da Início e entre as vibes de uma pessoa e outra. Na versão Web não há anúncios.',
        'Antes do primeiro anúncio, o app avisa que eles existem.',
      ],
    },
    {
      title: '2. Como reconhecer',
      paragraphs: [
        'Todo anúncio tem o selo "Patrocinado" e um visual diferente dos posts e das vibes. Nenhum post, review, vibe ou música publicado por pessoas do Soundhora é patrocinado.',
        'Na vibe anunciada, os botões Voltar e Pular e o X de fechar ficam sempre visíveis, fora do anúncio. O anúncio só abre quando você toca nele.',
      ],
    },
    {
      title: '3. Quem fornece e o que recebe',
      paragraphs: [
        'Os anúncios vêm do Google AdMob. Para mostrar e contar os anúncios, o SDK do Google no seu celular recebe dados técnicos do aparelho e da conexão, como modelo, sistema, endereço IP e o identificador de publicidade do aparelho, e segue a política de privacidade do Google.',
        'O Soundhora não envia ao Google nada da sua conta: nem @, nome, e-mail, data de nascimento, idade, gênero, gostos, posts, vibes ou mensagens.',
      ],
    },
    {
      title: '4. Sem anúncios personalizados',
      paragraphs: [
        'O Soundhora pede ao Google só anúncios não personalizados, para todas as pessoas: o anúncio não é escolhido pelo seu perfil nem pelo que você faz no app ou em outros apps.',
        'Para quem tem 16 ou 17 anos, o app também avisa ao Google que a pessoa é menor de idade e só aceita anúncios adequados para adolescentes.',
        'Se um dia houver anúncios personalizados, será só com o seu consentimento, que poderá ser retirado a qualquer momento em Configurações. Dados de menores de idade nunca serão usados para escolher anúncios, e seus dados nunca serão vendidos.',
      ],
    },
    { title: '5. Contato', paragraphs: [contactPt] },
  ],
};

const EN: Record<LegalDoc, LegalSection[]> = {
  terms: [
    {
      title: '1. What Soundhora is',
      paragraphs: [
        'Soundhora is a social network to discover and share music. You publish posts, album reviews and vibes, follow people and listen to 30-second previews.',
        'Soundhora doesn’t play full songs. Each song opens in the streaming app you choose (Spotify, Apple Music, Deezer and others).',
      ],
    },
    {
      title: '2. Who can use it',
      paragraphs: [
        'You must be at least 16. People under 16 can’t sign up, because the law requires the account to be linked to a guardian and Soundhora doesn’t offer that feature yet.',
        'Use real information when signing up. Your account is personal: don’t share or sell it.',
      ],
    },
    {
      title: '3. What you publish',
      paragraphs: [
        'Posts, comments, reviews, photos, videos and vibes remain yours. By publishing, you allow Soundhora to show this content to other people in the app.',
        'Don’t publish: hate speech, harassment, sexual content, violence, spam, other people’s personal data or material that infringes copyright.',
        'Music links open the official platforms. Don’t use Soundhora to distribute music without permission.',
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
        'Soundhora may change or end features. Important changes to these terms will be announced in the app.',
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
        'Searches: the text of what you search for, for 90 days and at most the last 100, to recommend posts and reviews. You can see, delete and turn this off in Settings › Privacy › Search history; turning it off deletes everything.',
        'Device: if you turn on phone notifications, we store the device code to send them.',
      ],
    },
    {
      title: '2. What we use it for',
      paragraphs: [
        'To make the app work: show your profile and content, build the feed, suggest songs, reviews and accounts based on your taste, send notifications and apply anti-spam limits.',
        'Your taste is computed by the server from the genres, artists and words of what you like, post, comment on and search for, songs liked in Discover and the genres of people you follow. It is only used to order what you see: nobody else sees it and it is not used for ads.',
        'For safety and moderation: review reports, suspend accounts that break the rules and prevent abuse.',
        'We don’t sell your data and don’t use it to choose ads (ads in the phone app are not personalized; see the Ads page).',
      ],
    },
    {
      title: '3. Who sees what',
      paragraphs: [
        'People with a Soundhora account see your public profile (name, @, photo, banner, bio, genres, favorite songs) and what you publish, except people you blocked or who blocked you.',
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
        'Google AdMob: ads in the phone app. Google’s SDK receives technical data about the device and connection (such as IP address and advertising ID), never data from your account. See the Ads page.',
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
        'Soundhora is for people 16 and older. People under 16 can’t sign up, because the law requires the account to be linked to a guardian and Soundhora doesn’t offer that feature yet.',
      ],
    },
    { title: '7. Contact', paragraphs: [contactEn] },
  ],
  guardians: [
    {
      title: '1. Who these terms are for',
      paragraphs: ['People aged 16 or 17 and their parent or legal guardian. People under 16 can’t use Soundhora.'],
    },
    {
      title: '2. What the guardian needs to know',
      paragraphs: [
        'Soundhora is a social network: what the person publishes (posts, reviews, vibes, comments) can be seen by other people. We recommend turning on the private account in Settings › Privacy, so only approved followers can see the content.',
        'The person can block and report anyone. Reports are reviewed by the team.',
        'Soundhora has no in-app purchases. Ads may appear in the phone app, always labeled "Sponsored", never personalized and only those suitable for teenagers.',
      ],
    },
    {
      title: '3. Data of minors',
      paragraphs: [
        'We only store what the account needs to work (see the Privacy Policy). The date of birth is only used to apply age rules and never appears on the profile.',
        'Data of minors is never used to choose ads or sold.',
        'The guardian can request access, correction or deletion of the person’s data through the contact below, and the person can delete the account in Settings › Delete account.',
      ],
    },
    { title: '4. Contact', paragraphs: [contactEn] },
  ],
  cookies: [
    {
      title: '1. What we store in your browser',
      paragraphs: [
        'On the Web, Soundhora stores in your browser (local storage) only what it needs to work: your sign-in session, language, the tips you’ve seen and your accessibility preferences.',
        'On your phone, the same information is stored on the device itself; the sign-in session is encrypted.',
      ],
    },
    {
      title: '2. What we don’t use',
      paragraphs: [
        'On the Web, we don’t use advertising cookies, cross-site tracking or third-party analytics. In the phone app, ads follow the Ads page.',
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
      title: '1. Where they appear',
      paragraphs: [
        'In the phone app (Android and iOS), Soundhora may show ads between posts in the Home feed and between one person’s vibes and the next. There are no ads on the Web.',
        'Before the first ad, the app tells you that ads exist.',
      ],
    },
    {
      title: '2. How to recognize them',
      paragraphs: [
        'Every ad carries the "Sponsored" label and looks different from posts and vibes. No post, review, vibe or song published by people on Soundhora is sponsored.',
        'On a sponsored vibe, the Back and Skip buttons and the close X are always visible, outside the ad. The ad only opens when you tap it.',
      ],
    },
    {
      title: '3. Who provides them and what they receive',
      paragraphs: [
        'Ads come from Google AdMob. To show and count ads, Google’s SDK on your phone receives technical data about the device and connection, such as model, operating system, IP address and the device’s advertising ID, and follows Google’s privacy policy.',
        'Soundhora sends Google nothing from your account: no @, name, email, date of birth, age, gender, tastes, posts, vibes or messages.',
      ],
    },
    {
      title: '4. No personalized ads',
      paragraphs: [
        'Soundhora asks Google for non-personalized ads only, for everyone: ads are not chosen based on your profile or on what you do in this or other apps.',
        'For people aged 16 or 17, the app also tells Google the person is a minor and only accepts ads suitable for teenagers.',
        'If personalized ads ever exist, it will only be with your consent, which you’ll be able to withdraw at any time in Settings. Data of minors will never be used to choose ads, and your data will never be sold.',
      ],
    },
    { title: '5. Contact', paragraphs: [contactEn] },
  ],
};

export function legalSections(doc: LegalDoc, locale: string): LegalSection[] {
  return (locale === 'pt-BR' ? PT : EN)[doc];
}
