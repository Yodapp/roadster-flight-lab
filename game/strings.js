// Grok-versionen · game UI strings (Swedish primary, English toggle). Shares the site's language key.
export const STR = {
  sv: {
    title: 'Sätt dig vid ratten', subtitle: 'Roadster-stunts · Grok-versionen',
    tagline: 'Fyra stunts från visningen i McGregor. 250 kg luft. Ingen andra chans.',
    play: 'Spela', sandbox: 'Fri körning', back: '← Analysen', menu: 'Meny', retry: 'Igen', next: 'Nästa', start: 'Kör!', resume: 'Fortsätt',
    lv_launch: '0–60 mph', lv_ramp: 'Loopramp', lv_kickflip: 'Kickflip', lv_hop: 'Hopp & korkskruv', lv_sandbox: 'Fri körning',
    ds_launch: 'Dragrace med jetstöd. Teslas påstående: 0,81 s.', ds_ramp: 'Upp och runt loopen, släpp, rulla rätt och landa.',
    ds_kickflip: 'Lyft över fem bilar inkl. en 4 m hög Semi – och rulla 360°.', ds_hop: 'Lodrätt upp 4 m, snurra ett varv, landa mjukt på plattan.',
    ds_sandbox: 'Kör runt på testbanan. R fyller luften.',
    tut_launch: '<b>1.</b> Slå på <b>FLÄKT</b> (suget ger grepp). <b>2.</b> Vänta på <b>grönt</b> – tjuvstart = diskad. <b>3.</b> Håll <b>GAS</b>. <b>4.</b> <b>BOOST</b> = 80 kN bakåtjets, men den äter luft. ★★★ = 0,81 s med högst 35 kg luft.',
    tut_ramp: '<b>1.</b> Slå på <b>FLÄKT</b> – utan sug ramlar du av i loopen. <b>2.</b> Kör rakt in i rampen med <b>GAS</b> (4–8 m/s räcker). <b>3.</b> Uppe och upp-och-ner: tryck <b>SLÄPP</b>. <b>4.</b> Rulla rätt med <b>spaken</b>. <b>5.</b> Tryck <b>LYFT</b> när det står <b>BROMSA</b> – landa under 3 m/s.',
    tut_kickflip: '<b>1.</b> Du rullar i 50 km/h. <b>2.</b> Håll <b>LYFT</b> vid den gula linjen tills du är högt över Semin. <b>3.</b> Spaken åt sidan = <b>rulla 360°</b>. <b>4.</b> Rätt upp igen? <b>LYFT</b> för att bromsa landningen.',
    tut_hop: '<b>1.</b> Håll <b>LYFT</b> – 60 kN lyfter 2,2 ton. <b>2.</b> Över 4 m: snurra med <b>⟲ ⟳</b> (Q/E). <b>3.</b> Bromsa fallet med <b>LYFT</b> och landa på plattan.',
    tut_sandbox: 'Allt är tillåtet. <b>R</b> eller ⛽ fyller tanken.',
    keys: 'Tangentbord: W/S gas/broms · A/D styr (luft: rulla) · W/S i luften: tippa · Q/E gira · Mellanslag LYFT/SLÄPP · Shift BOOST · F fläkt · C kamera · P paus',
    gas: 'GAS', brake: 'BROMS', boost: 'BOOST', lift: 'LYFT', release: 'SLÄPP', fan: 'FLÄKT', refill: 'Fyll',
    air: 'LUFT', suction: 'SUG', speed: 'km/h', alt: 'HÖJD', vs: 'V-FART', grip: 'GREPP',
    brakeNow: 'BROMSA!', releaseNow: 'SLÄPP NU!', fansOff: 'Fläkten är av!', tooFast: 'Lyft!', rollUp: 'Rulla rätt!',
    stage: 'Slå på fläkten och vänta på grönt…', go: 'KÖR!',
    perfect: 'PERFEKT LANDNING', good: 'BRA LANDNING', hard: 'HÅRD LANDNING', crash: 'KRASCH',
    won: 'Klarat!', lost: 'Misslyckades', newBest: 'Nytt rekord!', best: 'Bäst',
    r_jump: 'Tjuvstart! Gasen före grönt.', r_slow: 'För långsamt – kom ihåg gasen.', r_tooHard: 'För hård landning – bromsa tidigare med LYFT.',
    r_notUpright: 'Landade inte på hjulen – rulla rätt först.', r_sideways: 'För mycket sidfart vid landningen.', r_obstacle: 'Du träffade {name}.',
    r_rampMiss: 'Du missade rampen – kör rakt in.', r_detached: 'Bilen släppte från rampen – fläkt på och mer fart.', r_time: 'Tiden tog slut.',
    r_around: 'Runt raden räknas inte – över!', r_short: 'Du landade före raden.', r_low: 'Inte 4 m – håll LYFT längre.', r_offpad: 'Utanför plattan.',
    outOfAir: 'Slut på luft!', fact: 'Visste du? 80 kN i 5 s kräver ≈ 900 kg luft – 3,6 gånger mer än hela tanken. 250 kg räcker ungefär en sekund på full dragkraft.',
    m_t60: '0–60 mph', m_reaction: 'Reaktion', m_gas: 'Luft', m_vy: 'Landning', m_tilt: 'Lutning', m_flip: 'Rullat', m_spin: 'Snurrat', m_alt: 'Maxhöjd', m_release: 'Släpp', m_score: 'Poäng',
    tesla: 'Tesla: 0,81 s', cam: 'Kamera', cockpit: 'Förarplats', chase: 'Bakom',
    note: 'Ett spel byggt på <b>våra</b> fysikuppskattningar (luftbudget, impuls, sug) – inte Teslas data. Stiliserade fordon, inga logotyper.',
    credit: 'Bygger på <a href="https://github.com/fltman/roadster-flight-lab">Anders Bjarbys Roadster Flight Lab</a> (<a href="https://bjarby.com/roadster/">bjarby.com/roadster</a>), med hans tillstånd.',
    sound: 'Ljud', assist: 'Stabilisering', on: 'på', off: 'av', quality: 'Grafik', auto: 'Auto', loading: 'Laddar 3D…', paused: 'Paus', rotate: 'Tips: vrid mobilen för bredbild',
    stars0: 'Inga stjärnor – försök igen', tilt: 'tilt',
    st_launch: ['Under 2,6 s', 'Slå 0,81 s', '0,81 s med ≤ 35 kg luft'], st_ramp: ['Landa', 'Bra landning (≤ 3 m/s)', 'Perfekt (≤ 1,6 m/s, rak)'],
    st_kickflip: ['Över raden', '+ 360° rull', '+ bra landning'], st_hop: ['4 m upp, landa på plattan', '+ ett varv', '+ perfekt landning'],
  },
  en: {
    title: 'Get behind the wheel', subtitle: 'Roadster stunts · Grok version',
    tagline: 'Four stunts from the McGregor demo. 250 kg of air. No second chance.',
    play: 'Play', sandbox: 'Free drive', back: '← Analysis', menu: 'Menu', retry: 'Retry', next: 'Next', start: 'Go!', resume: 'Resume',
    lv_launch: '0–60 mph', lv_ramp: 'Loop ramp', lv_kickflip: 'Kickflip', lv_hop: 'Hop & corkscrew', lv_sandbox: 'Free drive',
    ds_launch: 'Drag race with jet assist. Tesla claims 0.81 s.', ds_ramp: 'Up and around the loop, release, roll upright and land.',
    ds_kickflip: 'Lift over five cars incl. a 4 m Semi – and roll 360°.', ds_hop: 'Straight up 4 m, spin once, land softly on the pad.',
    ds_sandbox: 'Drive around the test site. R refills the air.',
    tut_launch: '<b>1.</b> Switch on the <b>FAN</b> (suction = grip). <b>2.</b> Wait for <b>green</b> – jump start = disqualified. <b>3.</b> Hold <b>GAS</b>. <b>4.</b> <b>BOOST</b> = 80 kN rear jets, but it eats air. ★★★ = 0.81 s using at most 35 kg of air.',
    tut_ramp: '<b>1.</b> Switch on the <b>FAN</b> – without suction you fall off the loop. <b>2.</b> Drive straight into the ramp with <b>GAS</b> (4–8 m/s is plenty). <b>3.</b> At the top, upside down: press <b>RELEASE</b>. <b>4.</b> Roll upright with the <b>stick</b>. <b>5.</b> Press <b>LIFT</b> when it says <b>BRAKE</b> – land below 3 m/s.',
    tut_kickflip: '<b>1.</b> You are rolling at 50 km/h. <b>2.</b> Hold <b>LIFT</b> at the yellow line until you are well above the Semi. <b>3.</b> Stick sideways = <b>roll 360°</b>. <b>4.</b> Upright again? <b>LIFT</b> to brake the landing.',
    tut_hop: '<b>1.</b> Hold <b>LIFT</b> – 60 kN lifts 2.2 tonnes. <b>2.</b> Above 4 m: spin with <b>⟲ ⟳</b> (Q/E). <b>3.</b> Brake the fall with <b>LIFT</b> and land on the pad.',
    tut_sandbox: 'Anything goes. <b>R</b> or ⛽ refills the tank.',
    keys: 'Keyboard: W/S gas/brake · A/D steer (air: roll) · W/S in the air: pitch · Q/E yaw · Space LIFT/RELEASE · Shift BOOST · F fan · C camera · P pause',
    gas: 'GAS', brake: 'BRAKE', boost: 'BOOST', lift: 'LIFT', release: 'RELEASE', fan: 'FAN', refill: 'Refill',
    air: 'AIR', suction: 'SUCTION', speed: 'km/h', alt: 'ALT', vs: 'V/S', grip: 'GRIP',
    brakeNow: 'BRAKE!', releaseNow: 'RELEASE NOW!', fansOff: 'Fan is off!', tooFast: 'Lift!', rollUp: 'Roll upright!',
    stage: 'Switch on the fan and wait for green…', go: 'GO!',
    perfect: 'PERFECT LANDING', good: 'GOOD LANDING', hard: 'HARD LANDING', crash: 'CRASH',
    won: 'Done!', lost: 'Failed', newBest: 'New best!', best: 'Best',
    r_jump: 'Jump start! Throttle before green.', r_slow: 'Too slow – remember the throttle.', r_tooHard: 'Landed too hard – brake earlier with LIFT.',
    r_notUpright: 'Not on the wheels – roll upright first.', r_sideways: 'Too much sideways speed at touchdown.', r_obstacle: 'You hit the {name}.',
    r_rampMiss: 'You missed the ramp – drive straight in.', r_detached: 'The car came off the ramp – fan on and more speed.', r_time: 'Out of time.',
    r_around: 'Going around the row does not count – go over!', r_short: 'You landed before the row.', r_low: 'Not 4 m – hold LIFT longer.', r_offpad: 'Off the pad.',
    outOfAir: 'Out of air!', fact: 'Did you know? 80 kN for 5 s needs ≈ 900 kg of air – 3.6 times the whole tank. 250 kg lasts about one second at full thrust.',
    m_t60: '0–60 mph', m_reaction: 'Reaction', m_gas: 'Air', m_vy: 'Touchdown', m_tilt: 'Tilt', m_flip: 'Rolled', m_spin: 'Spun', m_alt: 'Max height', m_release: 'Release', m_score: 'Score',
    tesla: 'Tesla: 0.81 s', cam: 'Camera', cockpit: 'Cockpit', chase: 'Chase',
    note: 'A game built on <b>our</b> physics estimates (air budget, impulse, suction) – not Tesla data. Stylised vehicles, no logos.',
    credit: 'Built on <a href="https://github.com/fltman/roadster-flight-lab">Anders Bjarby\'s Roadster Flight Lab</a> (<a href="https://bjarby.com/roadster/">bjarby.com/roadster</a>), with his permission.',
    sound: 'Sound', assist: 'Stability assist', on: 'on', off: 'off', quality: 'Graphics', auto: 'Auto', loading: 'Loading 3D…', paused: 'Paused', rotate: 'Tip: rotate for widescreen',
    stars0: 'No stars – try again', tilt: 'tilt',
    st_launch: ['Under 2.6 s', 'Beat 0.81 s', '0.81 s with ≤ 35 kg air'], st_ramp: ['Land', 'Good landing (≤ 3 m/s)', 'Perfect (≤ 1.6 m/s, level)'],
    st_kickflip: ['Clear the row', '+ 360° roll', '+ good landing'], st_hop: ['4 m up, land on the pad', '+ one spin', '+ perfect landing'],
  },
};
let lang = (() => { try { return localStorage.getItem('grok-lang') || 'sv'; } catch { return 'sv'; } })();
if (!STR[lang]) lang = 'sv';
export const getLang = () => lang;
export const t = k => STR[lang][k] ?? STR.sv[k] ?? k;
export function setLang(l) {
  lang = STR[l] ? l : 'sv'; try { localStorage.setItem('grok-lang', lang); } catch {}
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach(el => { el.innerHTML = t(el.dataset.t); });
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }
}
export const fmt = (x, d = 0) => (lang === 'sv' ? x.toLocaleString('sv-SE', {minimumFractionDigits: d, maximumFractionDigits: d}) : x.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d})).replace('−', '-');
