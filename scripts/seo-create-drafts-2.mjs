// Wave 1 — remainder: pilier cils, sérum sourcils, pilier patch yeux. DRAFTS.
import fs from "node:fs"
const env = {}
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const DOMAIN = env.SHOPIFY_STORE_DOMAIN, TOKEN = env.SHOPIFY_ACCESS_TOKEN
const BLOG_ID = 89170575612, P = "https://talika.fr/products", B = "/blogs/astuces-beaute"

const articles = [
  {
    title: "Comment faire pousser ses cils plus vite : le guide 2026",
    meta_title: "Faire pousser ses cils : le guide complet 2026 | Talika",
    meta_description:
      "Cils courts ou clairsemés ? Découvrez comment faire pousser vos cils naturellement : cycle de pousse, gestes, erreurs à éviter et soins efficaces.",
    body: `
<p>Avoir une frange de cils longue et fournie, sans extensions ni faux-cils&nbsp;: c'est possible, à condition de comprendre comment <strong>fonctionne la pousse des cils</strong> et d'adopter les bons réflexes. Pionnier français du soin des cils depuis 1948, Talika vous livre son guide complet.</p>

<h2>Le cycle de pousse des cils</h2>
<p>Comme les cheveux, les cils suivent un cycle&nbsp;: croissance, repos, chute. Un cil vit en moyenne quelques mois avant de tomber et d'être remplacé. C'est pourquoi un soin de la pousse demande de la <strong>régularité sur la durée</strong>&nbsp;: on accompagne le cycle, on ne le force pas.</p>

<h2>Pourquoi les cils poussent mal</h2>
<ul>
<li><strong>Le maquillage agressif</strong> et un démaquillage trop rude qui cassent le cil.</li>
<li><strong>Les extensions et le recourbe-cils</strong> mal utilisés, qui fragilisent la fibre.</li>
<li><strong>L'âge et les carences</strong>, qui ralentissent la croissance.</li>
<li><strong>Le frottement des yeux</strong>, qui arrache les cils.</li>
</ul>

<h2>5 gestes pour des cils plus longs</h2>
<ol>
<li><strong>Démaquillez en douceur</strong> chaque soir, sans frotter.</li>
<li><strong>Faites des pauses</strong> dans les extensions et faux-cils.</li>
<li><strong>Brossez vos cils</strong> pour stimuler et répartir le soin.</li>
<li><strong>Appliquez un sérum de pousse</strong> quotidiennement.</li>
<li><strong>Soyez patiente et régulière</strong> pendant au moins 30 jours.</li>
</ol>

<h2>Le soin cils culte de Talika</h2>
<p>Avec déjà <strong>plus de 8 millions d'unités vendues</strong> dans le monde, <a href="${P}/lipocils-expert-le-soin-culte">Lipocils Expert</a> stimule visiblement <strong>la pousse des cils, leur courbure et leur pigmentation naturelle</strong>. Son secret&nbsp;: le <strong>Complexe Végétal Mythique Talika</strong>, enrichi en Peptide expert anti-âge, Coleus forskohlii et protéines de soie recourbantes. Une application quotidienne pendant 30 jours suffit. Pour aller plus loin, découvrez le <a href="${P}/lipocils-platinium">Lipocils Platinium</a>.</p>
<p>Bon à savoir&nbsp;: le sérum Talika est <strong>sans prostaglandine</strong>. Pour comprendre pourquoi c'est important, lisez notre article dédié sur le <a href="${B}">sérum cils sans prostaglandine</a>.</p>

<h2>FAQ</h2>
<h3>En combien de temps les cils repoussent-ils&nbsp;?</h3>
<p>Comptez environ 30 jours d'application quotidienne pour une pousse visible, et plusieurs mois pour un cycle complet.</p>
<h3>Le sérum cils s'utilise-t-il sous les extensions&nbsp;?</h3>
<p>Il est idéal entre deux poses d'extensions, pour renforcer le cil naturel.</p>
<h3>Peut-on l'appliquer avant le mascara&nbsp;?</h3>
<p>Oui&nbsp;: appliqué le soir comme soin, il n'empêche pas le maquillage le jour.</p>
`,
  },
  {
    title: "Sérum sourcils : lequel choisir pour des sourcils plus fournis",
    meta_title: "Sérum sourcils : lequel choisir ? | Talika",
    meta_description:
      "Comment choisir un sérum sourcils efficace pour densifier des sourcils clairsemés ? Critères, ingrédients et conseils d'application par Talika.",
    body: `
<p>Sourcils trop fins, troués par une ancienne épilation ou clairsemés avec l'âge&nbsp;? Un <strong>sérum sourcils</strong> peut aider à les redensifier. Encore faut-il bien le choisir. Voici les critères qui comptent vraiment.</p>

<h2>Ce qu'un bon sérum sourcils doit faire</h2>
<ul>
<li><strong>Stimuler la croissance</strong> du poil pour densifier la ligne.</li>
<li><strong>Agir sur la pigmentation</strong> pour des sourcils plus intenses.</li>
<li><strong>Être bien toléré</strong> sur cette zone proche de l'œil.</li>
</ul>

<h2>Les critères de choix</h2>
<ol>
<li><strong>La composition</strong>&nbsp;: privilégiez les actifs végétaux, idéalement sans prostaglandine.</li>
<li><strong>La double action</strong> pousse + pigmentation, pour un résultat visible.</li>
<li><strong>La facilité d'application</strong>&nbsp;: un applicateur précis suit la ligne du sourcil.</li>
<li><strong>La régularité possible</strong>&nbsp;: un soin qu'on applique sans contrainte au quotidien.</li>
</ol>

<h2>Le sérum sourcils Talika</h2>
<p><a href="${P}/liposourcils-expert">Liposourcils Expert</a> est un soin unique qui <strong>stimule la croissance sourcilière</strong> tout en agissant sur leur <strong>pigmentation naturelle</strong> — pour des sourcils plus fournis et mieux dessinés. Pour une version experte, le <a href="${P}/liposourcils-platinium">Liposourcils Platinium</a> va plus loin&nbsp;; et au quotidien, le <a href="${P}/gel-fixateur-sourcils">Gel Fixateur Sourcils</a> discipline et structure la ligne.</p>

<h2>Comment l'appliquer</h2>
<ol>
<li>Sur sourcils propres et secs.</li>
<li>Appliquez le long de la ligne du sourcil, une fois par jour.</li>
<li>Soyez régulière&nbsp;: les résultats s'installent sur plusieurs semaines.</li>
</ol>

<p><em>Pour le mode d'emploi complet, voir notre <a href="${B}">guide pour faire repousser ses sourcils</a>.</em></p>

<h2>FAQ</h2>
<h3>Au bout de combien de temps voit-on un résultat&nbsp;?</h3>
<p>Comptez 6 à 8 semaines d'application régulière pour une repousse visible.</p>
<h3>Un sérum sourcils peut-il s'utiliser sur les cils&nbsp;?</h3>
<p>Non&nbsp;: chaque soin est formulé pour sa zone. Pour les cils, utilisez un sérum dédié.</p>
`,
  },
  {
    title: "Patch yeux : comment choisir (cernes, poches, anti-âge)",
    meta_title: "Patch yeux : comment bien choisir ? | Talika",
    meta_description:
      "Cernes, poches, fatigue ou anti-âge : quel patch yeux choisir ? Le guide Talika pour un contour de l'œil défatigué et un regard lumineux.",
    body: `
<p>Les <strong>patchs yeux</strong> sont devenus le geste défatigue-regard incontournable. Mais entre cernes, poches, hydratation et anti-âge, tous ne répondent pas au même besoin. Voici comment choisir le bon, en expert du regard.</p>

<h2>Identifier votre besoin</h2>
<ul>
<li><strong>Cernes</strong>&nbsp;: cherchez un patch qui illumine et lisse le contour.</li>
<li><strong>Poches</strong>&nbsp;: privilégiez une action décongestionnante et fraîche.</li>
<li><strong>Sécheresse / ridules</strong>&nbsp;: optez pour un patch ultra-hydratant riche en huiles et céramides.</li>
<li><strong>Anti-âge</strong>&nbsp;: visez des actifs lissants et repulpants.</li>
</ul>

<h2>Jetable ou réutilisable&nbsp;?</h2>
<p>Les patchs jetables sont pratiques&nbsp;; les <strong>patchs réutilisables</strong> sont plus économiques et plus durables, sans rien sacrifier à l'efficacité. Pour tout comprendre, voir notre article sur le <a href="${B}">patch yeux réutilisable</a>.</p>

<h2>Les patchs yeux Talika</h2>
<p>L'<a href="${P}/eye-therapy-patch">Eye Therapy Patch</a>, adoré des célébrités et des dermatologues depuis 20 ans, délivre une dose testée dermatologiquement d'<strong>huiles végétales de rose musquée, germe de blé et avocat</strong>, de <strong>céramides et beurre de karité</strong>&nbsp;: en 15 minutes, le regard est rafraîchi, hydraté et visiblement lissé. Il est <strong>rinçable et réutilisable</strong>. Pour une action ultra-hydratante, le <a href="${P}/bio-enzymes-patch">Bio Enzymes Eye Patch</a> est une excellente option.</p>

<h2>Comment utiliser un patch yeux</h2>
<ol>
<li>Appliquez sous l'œil sur peau propre.</li>
<li>Laissez poser 15 minutes.</li>
<li>Retirez et massez l'excédent, ou rincez si le patch est réutilisable.</li>
</ol>

<h2>FAQ</h2>
<h3>À quel moment utiliser un patch yeux&nbsp;?</h3>
<p>Le matin pour défatiguer le regard, ou avant un événement pour un effet bonne mine immédiat.</p>
<h3>Les patchs yeux remplacent-ils une crème contour&nbsp;?</h3>
<p>Ils sont complémentaires&nbsp;: le patch offre un boost ponctuel, la crème un soin quotidien.</p>
<h3>Peut-on les utiliser tous les jours&nbsp;?</h3>
<p>Oui, selon les besoins de votre contour de l'œil.</p>
`,
  },
]

async function createDraft(a) {
  const res = await fetch(`https://${DOMAIN}/admin/api/2024-10/blogs/${BLOG_ID}/articles.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({
      article: {
        title: a.title, body_html: a.body.trim(), published: false, author: "Talika", tags: "SEO",
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
