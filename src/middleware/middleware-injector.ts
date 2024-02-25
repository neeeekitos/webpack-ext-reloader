import { SourceMapConsumer, SourceMapGenerator } from "source-map";
import { Compilation } from "webpack";
import { ConcatSource, RawSource, Source } from "webpack-sources";
import { SourceFactory } from "../../typings";
import middleWareSourceBuilder from "./middleware-source-builder";

const middlewareInjector: MiddlewareInjector = async (
  { background, contentScript, extensionPage },
  { port, reloadPage },
) => {
  const source: Source = middleWareSourceBuilder({ port, reloadPage });
  const sourceFactory: SourceFactory = (...sources): Source => new ConcatSource(...sources);

  const matchBgOrContentOrPage = (name: string) =>
    name === background ||
    name === contentScript ||
    (contentScript && contentScript.includes(name)) ||
    name === extensionPage ||
    (extensionPage && extensionPage.includes(name));

  return async (assets, chunks: Compilation["chunks"]) =>
    Array.from(chunks).reduce(async (prev, { name, files }) => {
      if (matchBgOrContentOrPage(name)) {
        // eslint-disable-next-line no-restricted-syntax
        for (const entryPoint of files) {
          if (/\.js$/.test(entryPoint)) {
            const finalSrc = sourceFactory(source, assets[entryPoint]);

            const originalSourceMapFilename = `${entryPoint}.map`;
            const originalSourceMap: RawSource = assets[originalSourceMapFilename];

            if (originalSourceMap) {
              const reloaderContent = source.source() as string;
              const offset = reloaderContent.split("\n").length;
              // eslint-disable-next-line no-await-in-loop
              const consumer = await new SourceMapConsumer(JSON.parse(originalSourceMap.source()));
              const concatenatedSourceMap = new SourceMapGenerator();
              consumer.eachMapping((mapping) => {
                concatenatedSourceMap.addMapping({
                  source: originalSourceMapFilename,
                  original: { line: mapping.originalLine, column: mapping.originalColumn },
                  generated: { line: offset, column: mapping.generatedColumn },
                });
              });
              prev[originalSourceMapFilename] = concatenatedSourceMap.toString();
            }

            prev[entryPoint] = finalSrc;
          }
        }
      }
      return prev;
    }, {});
};

export default middlewareInjector;
