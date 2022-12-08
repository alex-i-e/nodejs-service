import {service} from "../Utils/PathToResource';
import {NepService} from "../Utils/PathToResource';
import {User} from "../Http/PathToResource';
import * as moment from "moment";
import {IAnalyzerResponse} from "../Model/PathToResource';
import {NepFilterMode, SoapBuilder} from "../Utils/PathToResource';
import {trimWhitespace} from "../Utils/PathToResource';
import {InfoAction} from "../Model/PathToResource';
import {ErrorEnum, NewsError} from "../Error/PathToResource';

export enum InfoSection {
    Summary = 'Summary',
    Portfolio = 'Portfolio',
    Company = 'Company',
    Intraday = 'Intraday'
}

export interface InfoAlert {
    infoKey: string;
    sections: InfoSection[];
    times: string[];
    description: string;
}

@service()
export class InfoAlertsService {
    constructor(
        private nep: NepService,
        private user: User,
        private soapBuilder: SoapBuilder,
        private timezone: string) {
    }

    list(): Promise<InfoAlert[]> {
        return this.nep.query('NewsSvc_1_InfoInventory_1_Request', `<InfoInventory><req:UUID>${this.user.uuid}</req:UUID></InfoInventory>`)
            .then(res => {
                let items = res.Envelope.Body[0].NewsSvc_1_InfoInventory_1_Response[0].InfoInventory[0].InventoryItem || [];

                return items.map(data => {
                    let sections = [];

                    if (data.Section[0] == 'true') {
                        sections.push(InfoSection.Company);
                    }
                    if (data.Summary[0] == 'true') {
                        sections.push(InfoSection.Summary);
                    }
                    if (data.PortfolioSection[0] == 'true') {
                        sections.push(InfoSection.Portfolio);
                    }

                    let timeFieldIndex = 1;
                    let times = [];
                    while (data['DeliveryTime' + timeFieldIndex]) {
                        let rawTime = data['DeliveryTime' + timeFieldIndex][0];

                        times.push(rawTime);

                        timeFieldIndex++;
                    }

                    return {
                        infoKey: data.InfoKey[0],
                        sections,
                        times,
                        description: data.Search[0]
                    };
                });
            });
    }


    createOrUpdate(analysis: IAnalyzerResponse, action: InfoAction, subscriptionId: string, sections: InfoSection[], times: string[], infoKey: string = ''): Promise<string> {
        let filter = this.soapBuilder.compileFilter(analysis.node ? [analysis.node] : [], 'filter', analysis.params.searchIn, NepFilterMode.Normal);
        let destination = this.soapBuilder.buildDestinationValue(analysis.params.repositories);

        return this.nep.query('NewsSvc_1_InfoAdd_1_Request', trimWhitespace`
<InfoAdd req:destination="${destination}"
           req:summary="${~sections.indexOf(InfoSection.Summary) ? 'true' : 'false'}"
           req:section="${~sections.indexOf(InfoSection.Company) ? 'true' : 'false'}"
           req:portfolioSection="${~sections.indexOf(InfoSection.Portfolio) ? 'true' : 'false'}"
           req:intraday="${~sections.indexOf(InfoSection.Intraday) ? 'true' : 'false'}"
           req:action="${action}">
    <req:Filter>
        ${filter}
    </req:Filter>
    <req:TimeStamp>${moment().utc().format('YYYYMMDDTHHmmss.SSS+0000')}</req:TimeStamp>
    <req:InfoKey>${infoKey}</req:InfoKey>
    <req:SubscriptionID>${subscriptionId}</req:SubscriptionID>
    ${times.map((time, index) => `<req:DeliveryTime${index + 1}>${time} ${this.timezone}</req:DeliveryTime${index + 1}>`).join('')}
</InfoAdd>
        `)
            .then(data => data.Envelope.Body[0].NewsSvc_1_InfoAdd_1_Response[0].InfoAdd[0].InfoKey[0]._)
            .catch(() => {
                throw new NewsError(ErrorEnum.InfoAlerts, `Error request the backend.`);
            });
    }

    remove(infoKey: string): Promise<any> {
        return this.nep.query('NewsSvc_1_InfoRemove_1_Request', trimWhitespace`
<InfoRemove>
    <req:InfoKey>${infoKey}</req:InfoKey>
    <req:TimeStamp>${moment().format('YYYYMMDDTHHmmss.SSS+0000')}</req:TimeStamp>
</InfoRemove>
        `).then(() => 'OK');
    }
}
