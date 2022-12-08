import {service} from '../Utils/PathToResource';
import {ErrorEnum, NewsError} from '../Error/PathToResource';
import {HttpResponse} from '../Http/PathToResource';
import {
    IAlertSubscriptions,
    ICriterionItem,
    IInfoItem,
    IInfoOptions,
    IQueryItem,
    ISubscriptionEntity
} from '../Model/IInfo';
import {IUdfReqOptions, UdfService} from '../Utils/PathToResource';
import {LogEnum} from '../Debug/Logger/PathToResource';
import {Debug} from '../Debug/PathToResource';
import * as _ from "lodash";
import * as Promise from 'bluebird';

@service()
export class InfoOptionsService {
    constructor(private udf: UdfService,
                private debug: Debug) {
    }

    public getOptions(infoId: string): Promise<IInfoOptions> {
        const reqOptions: IUdfReqOptions = {
            dataPointName: 'AlertSubscriptions',
            path: 'AlertSubscriptionsID',
            where: {
                SubscriptionIds: [infoId]
            }
        };

        return this.udf.post(reqOptions)
            .then((response: HttpResponse) => {
                const buildList: IInfoItem[] = this.buildMappedList(<IAlertSubscriptions>response.body);

                return buildList && buildList.length ? buildList[0].options : {};
            })
            .catch(err => {
                throw new NewsError(ErrorEnum.Info, err.message, err);
            });
    }

    public buildMappedList(data: IAlertSubscriptions): IInfoItem[] {
        const alerts = (data && data.AlertSubscriptions && data.AlertSubscriptions.SubscriptionEntity) || [];
        const list = alerts.map(alert => <IInfoItem>{
            id: alert.AlertSubscription.Id,
            name: alert.AlertSubscription.Name,
            options: this.getOptionListByInfoQuery(alert)
        });

        return _.sortBy(list, 'name');
    }

    public getOptionListByInfoQuery(alert: ISubscriptionEntity): IInfoOptions {
        let criterion: ICriterionItem[] = [];
        let query: IQueryItem;
        let querySections: any[];
        const infoOptions: IInfoOptions = {
            industries: [],
            regions: [],
            portfolioActivitySummary: false,
            companyActivitySummary: false,
            globalTradesNews: false,
            topNews: false,
        };

        try {
            criterion = alert.UIPayloadParsed.DisplayCriteria.Criterion || [];
            query = <IQueryItem>JSON.parse(criterion.filter(item => item.Id === 'Query')[0].Values[0].Description);

        } catch (err) {
            criterion = [];
            query = {};
            this.debug.warning(LogEnum.Info, 'Parsing JSON is unavailable for string.', err);
            return infoOptions;
        }

        querySections = query.sections || [];
        querySections.reduce((acc, item) => infoOptions[item.type] = true, infoOptions);

        criterion.forEach(criteria => {
            switch (criteria.Id) {
                case 'Portfolio':
                    infoOptions.portfolioCode = criteria.Values[0].Code;
                    break;
                case 'Industry':
                    infoOptions.industries = criteria.Values.map(industry => ({
                        code: industry.Code,
                        description: industry.Description
                    }));
                    break;
                case 'Region':
                    infoOptions.regions = criteria.Values.map(region => ({
                        code: region.Code,
                        description: region.Description
                    }));
                    break;
            }
        });

        return infoOptions;
    }
}
