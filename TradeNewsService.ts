import {service} from '../Utils/PathToResource';
import {IHeadline} from '../Model/PathToResource';
import {ISnapshotParams} from '../Model/PathToResource';
import {
    IInfoError,
    IInfoOptions,
    ITradesNewsHeadline,
    ITradesNewsHeadlines,
    RegionalTradesNews,
    IRegionalTradesNewsHeadlines,
    OptionItem
} from '../Model/IInfo';
import {getOuterHtml} from '../Story/Utils/PathToResource';
import {htmlToDom} from '../Utils/PathToResource';
import {Token} from '../Model/PathToResource';
import {NepFormatEnum, NepStoryService} from '../Story/Nep/PathToResource';
import {ChainingStoriesDto, StoryDto} from '../Story/Model/PathToResource';
import {Compiler, OperatorPriority} from '../ExpressionAnalyzer/Compiler/PathToResource';
import {OperatorNormalizer, OperatorStrategy} from '../ExpressionAnalyzer/Normalizer/PathToResource';
import {SortOrderEnum} from '../Snapshot/PathToResource';
import {OnPremSnapshotService} from '../Snapshot/PathToResource';
import * as xpath from 'xpath';
import * as Promise from 'bluebird';
import {ErrorEnum, NewsError as Error} from "../Error/PathToResource';

export const GLOBAL_MARKET_NEWS_QUERY = 'topic:MKTS/GLOB';
const SNAPSHOT_PARAMS: ISnapshotParams = {
    number: 1,
    repositories: ['NewsWire'],
    sortOrder: SortOrderEnum.NewToOld
};

@service()
export class TradeNewsService {
    constructor(private compiler: Compiler,
                private nepStoryService: NepStoryService,
                private operatorNormalizer: OperatorNormalizer,
                private onPremSnapshotService: OnPremSnapshotService,
                private regionCodeMapping: any) {
    }

    public getGlobalTradeNews(analyzerResponse: Token[]): Promise<ITradesNewsHeadlines | IInfoError> {
        return this.queryHeadlines(analyzerResponse, SNAPSHOT_PARAMS)
            .then((globalTradesNews: { data: any, headlines: IHeadline[] }) => {
                return Promise.all([
                    globalTradesNews.headlines as ITradesNewsHeadline[],
                    this.getBulletedListStory(globalTradesNews.headlines[0] as ITradesNewsHeadline)
                ]);
            })
            .then(([globalTradesNews, globalTradesBulletedListStory]: [ITradesNewsHeadline[], StoryDto]) => {
                return {headlines: this.processNews(globalTradesNews, globalTradesBulletedListStory)};
            })
            .catch(() => {
                return {error: 'Failed to load Global Trade News'};
            });
    }

    public getRegionalTradeNews(headlineTokens: { [key: string]: Token[] }, infoOptions: IInfoOptions): Promise<RegionalTradesNews[]> {
        if (!infoOptions) {
            return Promise.reject(new Error(ErrorEnum.ArgumentError, 'Invalid Info Options'));
        }

        const regionsNews: Promise<IRegionalTradesNewsHeadlines | IInfoError>[] = [];

        infoOptions.regions.forEach(region => {
            const tokens: Token[] = headlineTokens[region.code];

            if (tokens) {
                regionsNews.push(this.queryRegionalHeadlines(tokens, region));
            }
        });

        return Promise.all(regionsNews);
    }

    private queryRegionalHeadlines(headlinesTokens: Token[], region: OptionItem): Promise<IRegionalTradesNewsHeadlines | IInfoError> {
        const response: IRegionalTradesNewsHeadlines = {
            regionCode: region.code,
            description: region.description,
            headlines: undefined,
            rics: this.getRegionalTradeRics(region.code)
        };

        if (headlinesTokens && headlinesTokens.length) {
            return this.queryHeadlines(headlinesTokens, SNAPSHOT_PARAMS)
                .then(headlines => {
                    return Promise.all([
                        headlines.headlines as ITradesNewsHeadline[],
                        this.getBulletedListStory(headlines.headlines[0] as ITradesNewsHeadline)
                    ]);
                })
                .then(([regionalTradesNews, regioanlTradesBulletedListStory]: [ITradesNewsHeadline[], StoryDto]) => {
                    response.headlines = this.processNews(regionalTradesNews, regioanlTradesBulletedListStory);
                    return response;
                })
                .catch(() => {
                    return {error: `Failed to load Regional Trade News for ${region.description}`};
                })
        }

        return Promise.resolve(response);
    }

    private getRegionalTradeRics(regionCode: string): string[] {
        return this.regionCodeMapping[regionCode] && this.regionCodeMapping[regionCode].futuresRics;
    }

    public getQueryRegionCode(regionCode: string): string {
        return this.regionCodeMapping[regionCode] ? this.regionCodeMapping[regionCode].rrCode : regionCode;
    }

    private queryHeadlines(queryToken: Token[], params: ISnapshotParams): Promise<{ headlines: IHeadline[] }> {
        const token: Token = this.compiler.compile(this.operatorNormalizer.normalize(queryToken, OperatorStrategy.Smart), OperatorPriority.Boolean);
        return <any>this.onPremSnapshotService.requestSnapshot(token, params);
    }

    private getBulletedListStory(tradesNews: ITradesNewsHeadline): Promise<StoryDto> {
        if (tradesNews) {
            const storyId: string = tradesNews.storyId;

            return this.nepStoryService.get(storyId, {mode: NepFormatEnum.Qualified})
                .then((story: ChainingStoriesDto) => story.activeStory);
        }

        return Promise.resolve({} as StoryDto);
    }

    private processNews(globalTradesNews: ITradesNewsHeadline[], storyData: StoryDto): ITradesNewsHeadline[] {
        const firstHeadline: ITradesNewsHeadline = globalTradesNews[0];

        if (storyData && storyData.html && firstHeadline) {
            const storyHtml = storyData.html;
            const storyDom = htmlToDom(storyHtml);
            firstHeadline.storyBulletedListHtml = this.extractBulletedList(storyDom);
        }

        return globalTradesNews;
    }

    private extractBulletedList(doc: Document): string {
        if (!doc.documentElement) {
            return;
        }

        const bulletedListElements = xpath.select('//ul[contains(@class, "bulleted-list") and contains(@class, "arrowlist")]', doc.documentElement);

        if (bulletedListElements.length > 0) {
            const bulletedList = bulletedListElements[0];
            bulletedList.attributes = {};

            return getOuterHtml(bulletedList);
        }
    }
}
