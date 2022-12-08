import {service} from '../Utils/PathToResource';
import {
    IInfoError,
    IndustryNews,
    ITopInfoFrontPage,
    ITopInfoIndustrySector,
    ITopInfoPackage,
    OptionItem
} from '../Model/IInfo';
import {IPageGroup, ITopHeadlines} from '../TopInfo/PathToResource';
import {CategoriesService} from '../TopInfo/PathToResource';
import {HeadlinesService} from '../TopInfo/PathToResource';
import {ErrorEnum, NewsError as Error} from "../Error/PathToResource';

export const FrontPageName = 'Front Page';

export const TopInfoPackageIds = {
    SP_PAGE_001: 'Front Page',
    SP_PAGE_060: 'Energy',
    SP_PAGE_012: 'Financials',
    SP_PAGE_032: 'Technology, Media & Telecoms',
    SP_PAGE_023: 'Industrials',
    SP_PAGE_016: 'Consumer Goods',
    SP_PAGE_015: 'Healthcare',
    SP_PAGE_731: 'Basic Materials', // Prod
    SP_PAGE_1990: 'Basic Materials' // QA/Alpha
};

@service()
export class TopInfoService {
    constructor(private categoriesService: CategoriesService,
                private headlinesService: HeadlinesService) {
    }

    public getTopInfoFrontPage(): Promise<ITopInfoFrontPage | IInfoError> {
        return this.categoriesService.request()
            .then(categoriesResponse => {
                const packages: ITopInfoPackage = TopInfoService.getGroupedPackages(categoriesResponse.pageGroups);
                const subscriptionId: string = packages[FrontPageName] ? packages[FrontPageName].subscriptionId : null;

                return Promise.all([this.headlinesService.request(subscriptionId), packages]);
            })
            .then(([headlines, packages]: [ITopHeadlines, ITopInfoPackage]) => ({
                headlines: headlines.headlines,
                pageId: packages[FrontPageName] ? packages[FrontPageName].pageId : ''
            }))
            .catch(() => {
                return {error: 'Failed to load Top News Front Page'};
            });
    }

    public getTopInfoIndustrySector(industries: OptionItem[], eagerFetchCount: number = 1): Promise<IndustryNews[]> {
        if (!industries) {
            return Promise.reject(new Error(ErrorEnum.ArgumentError, 'Invalid industries'));
        }

        const industryNews: Promise<ITopInfoIndustrySector | IInfoError>[] = [];

        return this.categoriesService.request()
            .then(categoriesResponse => {
                const packages: ITopInfoPackage = TopInfoService.getGroupedPackages(categoriesResponse.pageGroups);

                industries.forEach((industry, index) => {
                    industryNews.push(this.queryIndustryNews(industry, packages, index < eagerFetchCount));
                });

                return Promise.all(industryNews);
            });
    }

    private queryIndustryNews(industry: OptionItem, packages: ITopInfoPackage, regHeadlines: boolean = true): Promise<ITopInfoIndustrySector | IInfoError> {
        const subscriptionId: string = industry.description && packages[industry.description] ? packages[industry.description].subscriptionId : null;
        const pageId = packages[industry.description] ? packages[industry.description].pageId : '';

        const response: ITopInfoIndustrySector = {
            industryCode: industry.code,
            headlines: undefined,
            pageId,
            description: industry.description,
        };

        if (regHeadlines) {
            return this.headlinesService.request(subscriptionId)
                .then((industryNews: ITopHeadlines) => {
                    response.headlines = industryNews.headlines;
                    return response;
                })
                .catch(() => {
                    return {error: `Failed to load Top News Industry Sector for ${industry.description}`};
                });
        }

        return Promise.resolve(response);
    }

    private static getGroupedPackages(pageGroups: IPageGroup[] = []): ITopInfoPackage {
        const packages = {};
        pageGroups.forEach(pageGroup => {
            pageGroup.pages.forEach(page => {
                const packageId = TopInfoPackageIds[page.pageId];
                if (packageId) {
                    packages[packageId] = {
                        subscriptionId: page.headlinesId,
                        pageId: page.pageId
                    };
                }
            });
        });
        return packages;
    }
}
