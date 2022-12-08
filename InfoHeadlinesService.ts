import {service} from '../Utils/PathToResource';
import {NepService} from '../Utils/PathToResource';
import {NepFilterMode, SoapBuilder} from '../Utils/PathToResource';
import {HeadlineFactory} from '../Snapshot/PathToResource';
import {IToken, SearchInEnum} from '../Model/PathToResource';
import {IInfoError, ISignificantNews} from '../Model/PathToResource';
import {IHeadline} from '../Model/PathToResource';
import {SourceEnum} from '../Model/PathToResource';
import * as Promise from 'bluebird';

@service()
export class InfoHeadlinesService {
    constructor(private nep: NepService,
                private soapBuilder: SoapBuilder,
                private headlineFactory: HeadlineFactory) {
    }

    public getSignificantNews(query: IToken, repository: string[] = [SourceEnum.NewsWire], productName: string = '', snippets: boolean = false): Promise<ISignificantNews | IInfoError> {
        const repositoryValue = this.soapBuilder.buildDestinationValue(repository);
        const body = `<Info req:destination="${repositoryValue}" req:portfolioSummary="${snippets}">
                            <req:Filter>
                                ${this.soapBuilder.compileFilter([query], 'filter', SearchInEnum.HeadlineOnly, NepFilterMode.Normal)}
                            </req:Filter>
                        </Info>`;

        return this.nep.query('NewsSvc_1_Info_1_Request', body, {productName: productName})
            .then((response: any) => {
                return {headlines: this.extractHeadlines(response)};
            })
            .catch(() => {
                return {error: 'Failed to load Significant News'};
            });
    }

    private extractHeadlines(response: any): IHeadline[] {
        const info: any[] = response.Envelope.Body[0].NewsSvc_1_Info_1_Response[0].Info;
        const infoHeadlines: any[] = info && info[0] ? info[0].InfoHeadlines[0].Headline : [];

        return infoHeadlines.map(h => this.headlineFactory.create(h));
    }
}
