// Grok fork: cited sources (links only; Tesla figures in them are claims).
export const SOURCES = [
  ['USA Today', 'Tesla, Elon Musk unveil Roadster “flying car”', 'https://eu.usatoday.com/story/cars/news/2026/10/16/tesla-elon-musk-unveils-roadster-flying-car/92276476007/'],
  ['Tech Insider', 'Tesla Roadster flight tech: 80 kN thrust explained', 'https://tech-insider.org/tesla-roadster-flight-tech-80kn-thrust-explained-2026/'],
  ['flyingroadster.net', 'Is it real?', 'https://flyingroadster.net/is-it-real/'],
  ['CarBuzz', '2028 Tesla Roadster gallery & specs', 'https://carbuzz.com/2028-tesla-roadster-interior-exterior-gallery/'],
  ['Electrek', 'Are Tesla’s claims for its new “flying” Roadster real, or is it just full of cold gas?', 'https://electrek.co/2026/10/15/an-updated-technical-look-at-teslas-kick-flipping-0-60-in-1s-next-gen-roadster/'],
  ['InsideEVs', 'The Tesla Roadster’s thrusters last seconds. Refilling takes hours', 'https://insideevs.com/news/812205/tesla-roadster-replenishes-air-tanks/'],
  ['InsideEVs', 'Want the flying version of the Tesla Roadster? You’ll need an invite', 'https://insideevs.com/news/812156/tesla-roadster-thrusters/'],
  ['Snopes', 'Are videos of Tesla’s new “flying” car performing mid-air stunts real?', 'https://www.snopes.com/fact-check/tesla-flying-roadster-car-real/'],
  ['Road & Track', 'Watch the Tesla Roadster fly, flip, and launch from 0–60 mph in under 1 second', 'https://www.roadandtrack.com/news/a74159440/tesla-roadster-flip-float-launch-control-0-60-mph-videos/'],
  ['Car and Driver', 'Explained: how the Tesla Roadster flies, flips, and sucks', 'https://www.caranddriver.com/news/a74165059/tesla-roadster-thrusters-fan-system-explained/'],
  ['The Verge', 'The Tesla Roadster flew, drove upside down, and hit 60 mph in under a second', 'https://www.theverge.com/transportation/1012552/tesla-roadster-next-gen-reveal-elon-musk'],
  ['CoolProp', 'Thermophysical properties of air (used for the gas tables)', 'http://www.coolprop.org/fluid_properties/fluids/Air.html'],
];
const ul = document.getElementById('source-list');
if (ul) ul.innerHTML = SOURCES.map(([who, title, url]) => `<li><b>${who}</b> · <a href="${url}" rel="noopener">${title}</a></li>`).join('');
