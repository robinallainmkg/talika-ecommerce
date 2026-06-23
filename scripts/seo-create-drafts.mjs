// Create SEO blog article DRAFTS (unpublished) on Talika "Astuces Beauté" blog.
// Claims = réels (fiches produit Talika). Maillage vers fiches + pilier.
// Usage: node scripts/seo-create-drafts.mjs
import fs from "node:fs"

const env = {}
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const DOMAIN = env.SHOPIFY_STORE_DOMAIN
const TOKEN = env.SHOPIFY_ACCESS_TOKEN
const BLOG_ID = 89170575612 // Astuces Beauté
const P = "https://talika.fr/products"

const articles = [
  {
    title: "Comment faire repousser ses sourcils : le guide complet 2026",
    meta_title: "Faire repousser ses sourcils : guide complet 2026 | Talika",
    meta_description:
      "Sourcils clairsemés après épilation ? Découvrez comment faire repousser vos sourcils naturellement : causes, durée, gestes et soins qui marchent.",
    body: `
<p>Des sourcils trop épilés, clairsemés ou marqués par les années&nbsp;? La bonne nouvelle&nbsp;: dans la plupart des cas, <strong>les sourcils repoussent</strong>. Encore faut-il adopter les bons gestes et la bonne patience. Véritables «&nbsp;lignes de force&nbsp;» de l'architecture du visage, les sourcils jouent un rôle capital dans la perception de la beauté et du caractère. Voici le guide complet pour les retrouver plus denses.</p>

<h2>Pourquoi les sourcils deviennent clairsemés</h2>
<p>Plusieurs facteurs appauvrissent la densité sourcilière&nbsp;:</p>
<ul>
<li><strong>L'épilation répétée</strong>&nbsp;: à force d'arracher le poil, le bulbe peut se fatiguer et ralentir sa repousse.</li>
<li><strong>L'âge</strong>&nbsp;: la croissance pileuse ralentit naturellement avec le temps.</li>
<li><strong>Les carences et le stress</strong>&nbsp;: ils fragilisent le cycle de pousse.</li>
<li><strong>Le maquillage et les tatouages</strong> mal retirés, qui agressent la zone.</li>
</ul>

<h2>Combien de temps pour faire repousser ses sourcils&nbsp;?</h2>
<p>Un poil de sourcil a un cycle de vie plus court qu'un cheveu. Comptez en général <strong>6 à 8 semaines</strong> pour voir une repousse visible, et jusqu'à plusieurs mois pour une densité homogène. La régularité est la clé&nbsp;: un soin appliqué quotidiennement donne de bien meilleurs résultats qu'une application occasionnelle.</p>

<h2>Les gestes qui favorisent la repousse</h2>
<ol>
<li><strong>Arrêtez de sur-épiler.</strong> Laissez le poil repousser plusieurs semaines avant de redéfinir la ligne.</li>
<li><strong>Brossez vos sourcils chaque jour</strong> avec une brosse spoolie pour stimuler la microcirculation.</li>
<li><strong>Nourrissez la zone</strong> avec un soin ciblé conçu pour la croissance sourcilière.</li>
<li><strong>Soyez régulière</strong>&nbsp;: la repousse est un processus de fond.</li>
</ol>

<h2>Le soin sourcils Talika</h2>
<p><a href="${P}/liposourcils-expert">Liposourcils Expert</a> est un soin unique qui non seulement <strong>stimule la croissance sourcilière</strong>, mais agit également sur leur <strong>pigmentation naturelle</strong> — pour des sourcils à la fois plus fournis et plus intenses. Pour discipliner et densifier au quotidien, le <a href="${P}/gel-fixateur-sourcils">Gel Fixateur Sourcils</a> complète idéalement la routine, et le <a href="${P}/liposourcils-platinium">Liposourcils Platinium</a> propose une version experte.</p>

<h2>FAQ</h2>
<h3>Les sourcils repoussent-ils après une épilation excessive&nbsp;?</h3>
<p>Dans la majorité des cas oui, mais cela peut prendre plusieurs semaines à plusieurs mois selon la fatigue du bulbe. Un soin stimulant accélère le processus.</p>
<h3>Un sérum sourcils est-il efficace&nbsp;?</h3>
<p>Un soin formulé pour la croissance, appliqué quotidiennement, aide à densifier visiblement les sourcils clairsemés. La régularité reste déterminante.</p>
<h3>Faut-il une ordonnance&nbsp;?</h3>
<p>Non, un soin cosmétique sans prostaglandine s'utilise librement, contrairement à certains produits sur ordonnance.</p>

<p><em>Envie d'aller plus loin sur le regard&nbsp;? Découvrez aussi notre guide pour <a href="/blogs/astuces-beaute">faire pousser ses cils</a>.</em></p>
`,
  },
  {
    title: "Patch yeux réutilisable : la solution durable contre les cernes",
    meta_title: "Patch yeux réutilisable : anti-cernes durable | Talika",
    meta_description:
      "Les patchs yeux réutilisables allient efficacité anti-fatigue et zéro déchet. Découvrez comment ils décongestionnent le regard et lequel choisir.",
    body: `
<p>Les patchs pour les yeux jetables, c'est efficace… mais ça génère beaucoup de déchets. Bonne nouvelle&nbsp;: il existe des <strong>patchs yeux réutilisables</strong>, aussi performants pour défatiguer le regard, et bien plus durables. On vous explique tout.</p>

<h2>Pourquoi choisir un patch yeux réutilisable</h2>
<ul>
<li><strong>Économique</strong>&nbsp;: un même patch s'utilise plusieurs fois, au lieu d'une paire jetable à chaque usage.</li>
<li><strong>Plus durable</strong>&nbsp;: moins de déchets, une démarche plus responsable.</li>
<li><strong>Tout aussi efficace</strong>&nbsp;: les meilleurs modèles délivrent une dose concentrée d'actifs hydratants et lissants.</li>
</ul>

<h2>Comment agissent les patchs sur le contour de l'œil</h2>
<p>Le contour de l'œil est une zone fine et fragile, vite marquée par la fatigue, les cernes et les poches. Un bon patch&nbsp;:</p>
<ul>
<li><strong>hydrate intensément</strong> grâce à des huiles végétales et des céramides&nbsp;;</li>
<li><strong>apaise</strong> et rafraîchit la peau&nbsp;;</li>
<li><strong>lisse visiblement</strong> les ridules de déshydratation.</li>
</ul>

<h2>Le patch yeux réutilisable Talika</h2>
<p>L'<a href="${P}/eye-therapy-patch">Eye Therapy Patch</a> est un traitement pour les yeux adoré des célébrités et des dermatologues depuis 20 ans. Il délivre une dose testée dermatologiquement d'<strong>huiles végétales de rose musquée, de germe de blé et d'avocat</strong>, ainsi que de <strong>céramides et de beurre de karité cliniquement prouvés</strong>. En 15 minutes, la peau est apaisée, le regard rafraîchi, hydraté et visiblement lissé. Très doux, il est <strong>rinçable à l'eau et réutilisable</strong> — les résultats sont immédiatement visibles. Pour une action ultra-hydratante au quotidien, le <a href="${P}/bio-enzymes-patch">Bio Enzymes Eye Patch</a> est une excellente alternative.</p>

<h2>Comment utiliser ses patchs réutilisables</h2>
<ol>
<li>Appliquez sous l'œil sur peau propre.</li>
<li>Laissez poser 15 minutes.</li>
<li>Retirez, puis rincez le patch à l'eau pour le réutiliser.</li>
<li>Rangez-le dans son boîtier dédié entre deux usages.</li>
</ol>

<h2>FAQ</h2>
<h3>Combien de fois peut-on réutiliser un patch yeux&nbsp;?</h3>
<p>Cela dépend du modèle&nbsp;: l'Eye Therapy Patch se rince à l'eau et se réutilise plusieurs fois.</p>
<h3>Les patchs réutilisables sont-ils aussi efficaces que les jetables&nbsp;?</h3>
<p>Oui&nbsp;: l'efficacité vient des actifs délivrés, pas du caractère jetable. Un patch réutilisable de qualité offre les mêmes bénéfices anti-fatigue.</p>
<h3>À quelle fréquence les utiliser&nbsp;?</h3>
<p>Selon les besoins&nbsp;: en cure le matin pour défatiguer, ou ponctuellement avant un événement.</p>
`,
  },
  {
    title: "Sérum cils sans prostaglandine : pourquoi c'est le choix le plus sûr",
    meta_title: "Sérum cils sans prostaglandine : le choix sûr | Talika",
    meta_description:
      "Pourquoi privilégier un sérum cils sans prostaglandine ? On explique les risques des prostaglandines et l'alternative naturelle pour faire pousser ses cils.",
    body: `
<p>Vous cherchez un sérum pour <strong>faire pousser vos cils</strong>, mais les listes d'ingrédients vous perdent&nbsp;? Un mot revient souvent dans les controverses&nbsp;: la <strong>prostaglandine</strong>. Voici pourquoi de plus en plus de femmes choisissent un sérum cils <strong>sans prostaglandine</strong>, et ce que cela change.</p>

<h2>Qu'est-ce qu'une prostaglandine dans un sérum cils&nbsp;?</h2>
<p>Les analogues de prostaglandines sont des molécules utilisées dans certains sérums pour stimuler la pousse des cils. Très efficaces, ils sont aussi associés à des <strong>effets indésirables rapportés</strong>&nbsp;: rougeurs, irritations, sécheresse oculaire, voire modification de la pigmentation de la paupière ou de l'iris chez certaines personnes.</p>

<h2>Pourquoi préférer un sérum sans prostaglandine</h2>
<ul>
<li><strong>Mieux toléré</strong> par les yeux sensibles et les porteuses de lentilles.</li>
<li><strong>Pas d'effets secondaires</strong> de type prostaglandines.</li>
<li><strong>Utilisable librement</strong>, sans ordonnance.</li>
</ul>
<p>Le compromis&nbsp;? Un sérum naturel demande davantage de <strong>régularité</strong>&nbsp;: les résultats s'installent sur la durée plutôt que de façon brutale.</p>

<h2>L'alternative naturelle Talika</h2>
<p>Pionnier français du soin des cils, Talika mise sur une approche végétale depuis 1948. Avec déjà <strong>plus de 8 millions d'unités vendues</strong> dans le monde, <a href="${P}/lipocils-expert-le-soin-culte">Lipocils Expert</a> est un sérum culte qui <strong>stimule visiblement la pousse des cils, leur courbure et leur pigmentation naturelle</strong>. Son secret&nbsp;: le <strong>Complexe Végétal Mythique Talika</strong>, enrichi en Peptide expert anti-âge, en Coleus forskohlii (booster de pigmentation naturelle) et en protéines de soie recourbantes. Une application quotidienne pendant 30 jours suffit à voir la différence. Pour une version experte, découvrez aussi le <a href="${P}/lipocils-platinium">Lipocils Platinium</a>.</p>

<h2>Comment appliquer son sérum cils</h2>
<ol>
<li>Démaquillez soigneusement vos yeux.</li>
<li>Appliquez le sérum à la racine des cils, comme un eye-liner.</li>
<li>Une fois par jour, idéalement le soir.</li>
<li>Soyez régulière pendant au moins 30 jours.</li>
</ol>

<h2>FAQ</h2>
<h3>Un sérum sans prostaglandine fonctionne-t-il vraiment&nbsp;?</h3>
<p>Oui&nbsp;: un complexe végétal actif, appliqué quotidiennement, stimule visiblement la pousse. Il faut simplement être régulière sur la durée.</p>
<h3>Comment savoir si mon sérum contient des prostaglandines&nbsp;?</h3>
<p>Cherchez des termes en «&nbsp;-prost&nbsp;» dans la liste INCI (isopropyl cloprostenate, etc.). Leur absence est souvent mise en avant par les marques naturelles.</p>
<h3>En combien de temps voit-on des résultats&nbsp;?</h3>
<p>Comptez environ 30 jours d'application quotidienne pour une pousse visible.</p>
`,
  },
]

async function createDraft(a) {
  const res = await fetch(`https://${DOMAIN}/admin/api/2024-10/blogs/${BLOG_ID}/articles.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({
      article: {
        title: a.title,
        body_html: a.body.trim(),
        published: false, // DRAFT
        author: "Talika",
        tags: "SEO",
        metafields: [
          { namespace: "global", key: "title_tag", type: "single_line_text_field", value: a.meta_title },
          { namespace: "global", key: "description_tag", type: "single_line_text_field", value: a.meta_description },
        ],
      },
    }),
  })
  const j = await res.json()
  if (!res.ok) return console.error("FAIL:", a.title, JSON.stringify(j).slice(0, 300))
  console.log(`OK draft #${j.article.id} — ${j.article.title}`)
}

for (const a of articles) await createDraft(a)
