import {
  configurationFromEnvironment,
  generateCatalogFeed,
} from "./lib/catalog-generator.mjs";

const configuration = configurationFromEnvironment();
const result = await generateCatalogFeed(configuration);

console.log(
  `Watchmaker catalogue feed generated at ${configuration.outputRoot}: ` +
    `${result.statistics.titles.toLocaleString()} provider-title records, ` +
    `${result.statistics.withPosters.toLocaleString()} with posters.`,
);
if (result.warnings.length > 0) {
  for (const warning of result.warnings) console.warn("Warning: " + warning);
}
