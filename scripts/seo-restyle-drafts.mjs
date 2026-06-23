// Re-style existing SEO drafts: featured image + product cards + callouts.
// Updates EXISTING article IDs (PUT). Stays DRAFT.
import fs from "node:fs"
const env = {}
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const DOMAIN = env.SHOPIFY_STORE_DOMAIN, TOKEN = env.SHOPIFY_ACCESS_TOKEN
const BLOG_ID = 89170575612, P = "https://talika.fr/products", B = "/blogs/astuces-beaute"

const IMG = {
  lipocils: "https://cdn.shopify.com/s/files/1/0513/4299/9748/files/lipocils-expert-le-soin-culte.jpg?v=1775822089",
  lipocilsPlat: "https://cdn.shopify.com/s/files/1/0513/4299/9748/files/lipocils-platinium.jpg?v=1775984693",
  liposourcils: "https://cdn.shopify.com/s/files/1/0513/4299/9748/files/eyebrownblu-Editbassedef.jpg?v=1709832499",
  liposourcilsPlat: "https://cdn.shopify.com/s/files/1/0513/4299/9748/files/liposourcils-platinium.jpg?v=1775822494",
  eyeTherapy: "https://cdn.shopify.com/s/files/1/0513/4299/9748/products/Eye-Therapy-patches10_650x_7aae51f5-0608-4675-b930-73f97375fa01.webp?v=1663334586",
  bioEnzymes: "https://cdn.shopify.com/s/files/1/0513/4299/9748/files/bio-enzymes-patch.jpg?v=1775822376",
}

// --- styled components (inline styles → rendu garanti quel que soit le thème) ---
const callout = (html) =>
  `<div style="background:#f7f4ef;border-left:3px solid #1a1a1a;border-radius:8px;padding:18px 22px;margin:28px 0;font-size:.97em;">${html}</div>`

const card = (handle, name, desc, img, cta = "Découvrir") =>
  `<div style="display:flex;gap:18px;align-items:center;border:1px solid #ececec;border-radius:14px;padding:18px;margin:30px 0;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.04);">
  <a href="${P}/${handle}" style="flex:0 0 110px;"><img src="${img}" alt="${name}" width="110" height="110" style="width:110px;height:110px;object-fit:cover;border-radius:10px;display:block;"></a>
  <div style="flex:1;">
    <div style="font-weight:600;font-size:1.08em;margin-bottom:4px;">${name}</div>
    <div style="color:#555;font-size:.92em;margin-bottom:12px;">${desc}</div>
    <a href="${P}/${handle}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:9px 20px;border-radius:999px;font-size:.88em;letter-spacing:.02em;">${cta}</a>
  </div>
</div>`

const wrap = (inner) =>
  `<div style="max-width:760px;margin:0 auto;line-height:1.75;font-size:1.02em;">${inner}</div>`

// --- articles : id existant → { image, body } ---
const articles = [
  {
    id: 1003130650954, // sourcils — guide
    image: IMG.liposourcils,
    body: wrap(`
<p>Des sourcils trop épilés, clairsemés ou marqués par les années&nbsp;? Bonne nouvelle&nbsp;: dans la plupart des cas, <strong>les sourcils repoussent</strong>. Encore faut-il les bons gestes et un peu de patience. Véritables «&nbsp;lignes de force&nbsp;» du visage, les sourcils sont essentiels à l'harmonie du regard. Voici le guide complet pour les retrouver plus denses.</p>
<h2>Pourquoi les sourcils deviennent clairsemés</h2>
<ul>
<li><strong>L'épilation répétée</strong> : le bulbe se fatigue et ralentit sa repousse.</li>
<li><strong>L'âge</strong> : la croissance pileuse ralentit naturellement.</li>
<li><strong>Les carences et le stress</strong> : ils fragilisent le cycle de pousse.</li>
<li><strong>Le maquillage/tatouage</strong> mal retiré, qui agresse la zone.</li>
</ul>
${callout("<strong>À retenir</strong> — comptez <strong>6 à 8 semaines</strong> pour une repousse visible. La régularité prime : un soin quotidien bat largement une application occasionnelle.")}
<h2>Les gestes qui favorisent la repousse</h2>
<ol>
<li><strong>Arrêtez de sur-épiler</strong> : laissez repousser avant de redéfinir la ligne.</li>
<li><strong>Brossez vos sourcils</strong> chaque jour pour stimuler la microcirculation.</li>
<li><strong>Nourrissez la zone</strong> avec un soin ciblé croissance.</li>
<li><strong>Soyez régulière</strong> : c'est un travail de fond.</li>
</ol>
<h2>Le soin sourcils Talika</h2>
<p>Pensé pour la zone fragile du sourcil, <a href="${P}/liposourcils-expert">Liposourcils Expert</a> <strong>stimule la croissance sourcilière</strong> tout en agissant sur la <strong>pigmentation naturelle</strong> — pour des sourcils plus fournis et plus intenses.</p>
${card("liposourcils-expert", "Liposourcils Expert", "Stimule la croissance et ravive la pigmentation pour des sourcils plus fournis.", IMG.liposourcils)}
${card("liposourcils-platinium", "Liposourcils Platinium", "La version experte pour des sourcils visiblement redessinés.", IMG.liposourcilsPlat)}
<h2>FAQ</h2>
<h3>Les sourcils repoussent-ils après une épilation excessive&nbsp;?</h3>
<p>Le plus souvent oui, mais cela peut prendre plusieurs semaines à plusieurs mois. Un soin stimulant accélère le processus.</p>
<h3>Un sérum sourcils est-il efficace&nbsp;?</h3>
<p>Appliqué quotidiennement, il densifie visiblement les sourcils clairsemés. La régularité reste déterminante.</p>
<h3>Faut-il une ordonnance&nbsp;?</h3>
<p>Non, un soin cosmétique sans prostaglandine s'utilise librement.</p>
<p><em>À lire aussi : notre <a href="${B}">guide pour faire pousser ses cils</a>.</em></p>
`),
  },
  {
    id: 1003130683722, // patch réutilisable
    image: IMG.eyeTherapy,
    body: wrap(`
<p>Les patchs yeux jetables, c'est efficace… mais ça génère beaucoup de déchets. Il existe une alternative aussi performante et bien plus durable : les <strong>patchs yeux réutilisables</strong>.</p>
<h2>Pourquoi choisir un patch réutilisable</h2>
<ul>
<li><strong>Économique</strong> : un même patch s'utilise plusieurs fois.</li>
<li><strong>Plus durable</strong> : moins de déchets, démarche responsable.</li>
<li><strong>Tout aussi efficace</strong> : les meilleurs délivrent une dose concentrée d'actifs.</li>
</ul>
<h2>Comment agissent-ils sur le contour de l'œil</h2>
<p>Zone fine et fragile, le contour de l'œil marque vite la fatigue. Un bon patch <strong>hydrate</strong>, <strong>apaise</strong> et <strong>lisse visiblement</strong> les ridules de déshydratation.</p>
${callout("<strong>Le geste expert</strong> — 15 minutes de pose suffisent pour un regard rafraîchi. Idéal le matin pour défatiguer, ou avant un événement.")}
<h2>Le patch yeux réutilisable Talika</h2>
<p>L'<a href="${P}/eye-therapy-patch">Eye Therapy Patch</a>, adoré des célébrités et dermatologues depuis 20 ans, délivre une dose testée dermatologiquement d'<strong>huiles de rose musquée, germe de blé et avocat</strong>, de <strong>céramides et beurre de karité</strong>. Doux, <strong>rinçable à l'eau et réutilisable</strong> : les résultats sont immédiats.</p>
${card("eye-therapy-patch", "Eye Therapy Patch", "Patch yeux réutilisable, rinçable à l'eau. Regard lissé et hydraté en 15 min.", IMG.eyeTherapy)}
${card("bio-enzymes-patch", "Bio Enzymes Eye Patch", "L'alternative ultra-hydratante pour défatiguer le regard au quotidien.", IMG.bioEnzymes)}
<h2>Comment les utiliser</h2>
<ol>
<li>Appliquez sous l'œil sur peau propre.</li>
<li>Laissez poser 15 minutes.</li>
<li>Retirez, puis rincez le patch pour le réutiliser.</li>
<li>Rangez-le dans son boîtier entre deux usages.</li>
</ol>
<h2>FAQ</h2>
<h3>Combien de fois peut-on réutiliser un patch&nbsp;?</h3>
<p>L'Eye Therapy Patch se rince à l'eau et se réutilise plusieurs fois.</p>
<h3>Aussi efficaces que les jetables&nbsp;?</h3>
<p>Oui : l'efficacité vient des actifs délivrés, pas du caractère jetable.</p>
<p><em>Pour bien choisir selon votre besoin : notre <a href="${B}">guide des patchs yeux</a>.</em></p>
`),
  },
  {
    id: 1003130716490, // sérum cils sans prostaglandine
    image: IMG.lipocils,
    body: wrap(`
<p>Vous cherchez un sérum pour <strong>faire pousser vos cils</strong> mais les listes d'ingrédients vous perdent&nbsp;? Un mot revient dans les controverses : la <strong>prostaglandine</strong>. Voici pourquoi tant de femmes choisissent un sérum <strong>sans prostaglandine</strong>.</p>
<h2>Qu'est-ce qu'une prostaglandine dans un sérum cils&nbsp;?</h2>
<p>Ce sont des molécules utilisées pour stimuler la pousse. Très efficaces, elles sont aussi associées à des <strong>effets indésirables rapportés</strong> : rougeurs, irritations, sécheresse oculaire, voire modification de la pigmentation de la paupière ou de l'iris.</p>
${callout("<strong>Comment vérifier&nbsp;?</strong> Cherchez les termes en «&nbsp;-prost&nbsp;» dans la liste INCI (ex. <em>isopropyl cloprostenate</em>). Leur absence est souvent mise en avant par les marques naturelles.")}
<h2>Pourquoi préférer un sérum sans prostaglandine</h2>
<ul>
<li><strong>Mieux toléré</strong> par les yeux sensibles et porteuses de lentilles.</li>
<li><strong>Pas d'effets secondaires</strong> de type prostaglandines.</li>
<li><strong>Utilisable librement</strong>, sans ordonnance.</li>
</ul>
<p>Le compromis&nbsp;? Un sérum naturel demande davantage de <strong>régularité</strong> : les résultats s'installent dans la durée.</p>
<h2>L'alternative naturelle Talika</h2>
<p>Pionnier français depuis 1948, Talika mise sur le végétal. Avec <strong>plus de 8 millions d'unités vendues</strong>, <a href="${P}/lipocils-expert-le-soin-culte">Lipocils Expert</a> stimule visiblement <strong>la pousse, la courbure et la pigmentation</strong> des cils grâce au Complexe Végétal Mythique Talika.</p>
${card("lipocils-expert-le-soin-culte", "Lipocils Expert", "Le sérum cils culte, sans prostaglandine. Pousse visible en 30 jours.", IMG.lipocils)}
${card("lipocils-platinium", "Lipocils Platinium", "La formule experte pour des cils plus longs, courbés et intenses.", IMG.lipocilsPlat)}
<h2>Comment l'appliquer</h2>
<ol>
<li>Démaquillez soigneusement vos yeux.</li>
<li>Appliquez à la racine des cils, comme un eye-liner.</li>
<li>Une fois par jour, idéalement le soir.</li>
<li>Régularité pendant au moins 30 jours.</li>
</ol>
<h2>FAQ</h2>
<h3>Un sérum sans prostaglandine fonctionne-t-il vraiment&nbsp;?</h3>
<p>Oui : un complexe végétal actif, appliqué quotidiennement, stimule visiblement la pousse.</p>
<h3>En combien de temps des résultats&nbsp;?</h3>
<p>Environ 30 jours d'application quotidienne.</p>
<p><em>À lire aussi : <a href="${B}">comment faire pousser ses cils</a>.</em></p>
`),
  },
  {
    id: 1003131011402, // pousse cils — guide
    image: IMG.lipocils,
    body: wrap(`
<p>Une frange de cils longue et fournie, sans extensions ni faux-cils : c'est possible. Il faut comprendre comment <strong>fonctionne la pousse des cils</strong> et adopter les bons réflexes. Pionnier du soin des cils depuis 1948, Talika vous livre son guide.</p>
<h2>Le cycle de pousse des cils</h2>
<p>Comme les cheveux, les cils suivent un cycle : croissance, repos, chute. Un cil vit quelques mois avant d'être remplacé. D'où l'importance de la <strong>régularité</strong> : on accompagne le cycle, on ne le force pas.</p>
<h2>Pourquoi les cils poussent mal</h2>
<ul>
<li><strong>Maquillage agressif</strong> et démaquillage trop rude.</li>
<li><strong>Extensions et recourbe-cils</strong> mal utilisés.</li>
<li><strong>Âge et carences</strong>, qui ralentissent la croissance.</li>
<li><strong>Frottement des yeux</strong>, qui arrache les cils.</li>
</ul>
${callout("<strong>Bon à savoir</strong> — le sérum Talika est <strong>sans prostaglandine</strong>. Pour comprendre pourquoi c'est important, lisez notre article sur le <a href=\"" + B + "\">sérum cils sans prostaglandine</a>.")}
<h2>5 gestes pour des cils plus longs</h2>
<ol>
<li><strong>Démaquillez en douceur</strong> chaque soir.</li>
<li><strong>Faites des pauses</strong> dans les extensions et faux-cils.</li>
<li><strong>Brossez vos cils</strong> pour stimuler et répartir le soin.</li>
<li><strong>Appliquez un sérum de pousse</strong> quotidiennement.</li>
<li><strong>Patience et régularité</strong> pendant au moins 30 jours.</li>
</ol>
<h2>Le soin cils culte de Talika</h2>
<p>Avec <strong>plus de 8 millions d'unités vendues</strong>, <a href="${P}/lipocils-expert-le-soin-culte">Lipocils Expert</a> stimule visiblement la pousse, la courbure et la pigmentation naturelle des cils.</p>
${card("lipocils-expert-le-soin-culte", "Lipocils Expert", "Le sérum cils culte. Pousse visible en 30 jours, sans prostaglandine.", IMG.lipocils)}
${card("lipocils-platinium", "Lipocils Platinium", "La formule experte pour des cils plus longs et intenses.", IMG.lipocilsPlat)}
<h2>FAQ</h2>
<h3>En combien de temps les cils repoussent-ils&nbsp;?</h3>
<p>Environ 30 jours pour une pousse visible, plusieurs mois pour un cycle complet.</p>
<h3>S'utilise-t-il sous les extensions&nbsp;?</h3>
<p>Idéal entre deux poses, pour renforcer le cil naturel.</p>
`),
  },
  {
    id: 1003131044170, // sérum sourcils
    image: IMG.liposourcils,
    body: wrap(`
<p>Sourcils trop fins, troués par une ancienne épilation ou clairsemés avec l'âge&nbsp;? Un <strong>sérum sourcils</strong> aide à les redensifier. Encore faut-il bien le choisir.</p>
<h2>Ce qu'un bon sérum sourcils doit faire</h2>
<ul>
<li><strong>Stimuler la croissance</strong> pour densifier la ligne.</li>
<li><strong>Agir sur la pigmentation</strong> pour des sourcils plus intenses.</li>
<li><strong>Être bien toléré</strong> sur cette zone proche de l'œil.</li>
</ul>
<h2>Les critères de choix</h2>
<ol>
<li><strong>La composition</strong> : actifs végétaux, idéalement sans prostaglandine.</li>
<li><strong>La double action</strong> pousse + pigmentation.</li>
<li><strong>La précision de l'applicateur</strong>.</li>
<li><strong>La régularité possible</strong> au quotidien.</li>
</ol>
${callout("<strong>Patience</strong> — comptez 6 à 8 semaines d'application régulière pour une repousse visible.")}
<h2>Le sérum sourcils Talika</h2>
<p><a href="${P}/liposourcils-expert">Liposourcils Expert</a> stimule la croissance sourcilière tout en agissant sur la pigmentation naturelle — pour des sourcils plus fournis et mieux dessinés.</p>
${card("liposourcils-expert", "Liposourcils Expert", "Croissance + pigmentation, pour des sourcils visiblement plus fournis.", IMG.liposourcils)}
${card("liposourcils-platinium", "Liposourcils Platinium", "La version experte pour redessiner la ligne du sourcil.", IMG.liposourcilsPlat)}
<h2>FAQ</h2>
<h3>Au bout de combien de temps un résultat&nbsp;?</h3>
<p>6 à 8 semaines d'application régulière.</p>
<h3>Peut-on l'utiliser sur les cils&nbsp;?</h3>
<p>Non : chaque soin est formulé pour sa zone. Pour les cils, un sérum dédié.</p>
<p><em>Voir aussi : notre <a href="${B}">guide pour faire repousser ses sourcils</a>.</em></p>
`),
  },
  {
    id: 1003131076938, // patch yeux — guide
    image: IMG.eyeTherapy,
    body: wrap(`
<p>Les <strong>patchs yeux</strong> sont le geste défatigue-regard incontournable. Mais entre cernes, poches, hydratation et anti-âge, tous ne répondent pas au même besoin. Voici comment choisir, en expert du regard.</p>
<h2>Identifier votre besoin</h2>
<ul>
<li><strong>Cernes</strong> : un patch qui illumine et lisse le contour.</li>
<li><strong>Poches</strong> : une action décongestionnante et fraîche.</li>
<li><strong>Sécheresse / ridules</strong> : un patch ultra-hydratant (huiles, céramides).</li>
<li><strong>Anti-âge</strong> : des actifs lissants et repulpants.</li>
</ul>
${callout("<strong>Jetable ou réutilisable&nbsp;?</strong> Les réutilisables sont plus économiques et durables, sans rien sacrifier à l'efficacité. Tout comprendre dans notre article <a href=\"" + B + "\">patch yeux réutilisable</a>.")}
<h2>Les patchs yeux Talika</h2>
<p>L'<a href="${P}/eye-therapy-patch">Eye Therapy Patch</a>, adoré des célébrités et dermatologues depuis 20 ans, délivre huiles de rose musquée, germe de blé, avocat, céramides et beurre de karité : en 15 minutes, le regard est rafraîchi, hydraté et lissé. Rinçable et réutilisable.</p>
${card("eye-therapy-patch", "Eye Therapy Patch", "Patch yeux réutilisable. Regard lissé et hydraté en 15 minutes.", IMG.eyeTherapy)}
${card("bio-enzymes-patch", "Bio Enzymes Eye Patch", "Action ultra-hydratante pour défatiguer le contour de l'œil.", IMG.bioEnzymes)}
<h2>Comment utiliser un patch yeux</h2>
<ol>
<li>Appliquez sous l'œil sur peau propre.</li>
<li>Laissez poser 15 minutes.</li>
<li>Retirez et massez l'excédent (ou rincez si réutilisable).</li>
</ol>
<h2>FAQ</h2>
<h3>Quand utiliser un patch yeux&nbsp;?</h3>
<p>Le matin pour défatiguer, ou avant un événement pour un effet bonne mine.</p>
<h3>Remplacent-ils une crème contour&nbsp;?</h3>
<p>Complémentaires : le patch offre un boost ponctuel, la crème un soin quotidien.</p>
`),
  },
]

async function update(a) {
  const res = await fetch(`https://${DOMAIN}/admin/api/2024-10/blogs/${BLOG_ID}/articles/${a.id}.json`, {
    method: "PUT",
    headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({
      article: { id: a.id, body_html: a.body.trim(), image: { src: a.image }, published: false },
    }),
  })
  const j = await res.json()
  if (!res.ok) return console.error("FAIL", a.id, JSON.stringify(j).slice(0, 250))
  console.log(`OK restyled #${a.id} — ${j.article.title}`)
}
for (const a of articles) await update(a)
