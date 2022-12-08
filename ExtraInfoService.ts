import {service} from '../Utils/PathToResource';
import {IUdfReqOptions, UdfService} from '../Utils/PathToResource';
import {IExtraInfo, IExtraInfoModel} from '../Model/PathToResource';
import {IInfoError} from '../Model/PathToResource';
import {HttpResponse} from '../Http/PathToResource';
import * as Promise from 'bluebird';

type AnalystMsfInfo = {
    Instrument: string;
    AnalystPhoneNumber: string;
    AnalystEmailAddress: string;
    OverallRecStarRating: string;
    OverallEstStarRating: string;
}

type AnalystModel = {
    AnalystCode: string,
    AnalystPhone: string,
    AnalystEmail: string,
    AnalystOverallEstStarRating: string,
    AnalystOverallRecStarRating: string
}

@service()
export class ExtraInfoService {
    constructor(private readonly udf: UdfService) {
    }

    public getExtraInfo(ric: string): Promise<IExtraInfo | IInfoError> {
        const reqOptions: IUdfReqOptions = {
            dataPointName: 'ADC',
            where: {
                ProductID: 'TOPNEWS:CPVIEWS',
                Universe: [
                    `${ric}@RIC`
                ],
                Output: 'Col | Va, Row',
                Formulas: [
                    'AH.Recommendation.Change(0)'
                ],
                startRow: 0,
                rowCount: 500
            }
        };

        return this.udf.post(reqOptions)
            .then((response: HttpResponse) => {
                const result = (response && response.body && response.body.ADC && response.body.ADC.r) || [];
                const recChanges: IExtraInfoModel[] = this.msfConverter(result);
                const analystCodes = recChanges
                    .filter(item => item.Analyst !== 'Permission Denied')
                    .map(item => item.AnalystCode);

                return Promise.all([
                    recChanges,
                    this.getAnalystInfo(analystCodes)
                ]);
            })
            .then(([recChanges, analystList]) => {
                const items = recChanges.reduce((acc, item) => {
                    let mergeObj = {...item};
                    analystList.forEach(analyst => {
                        if (item.AnalystCode === analyst.AnalystCode)
                            mergeObj = {...item, ...analyst};
                    });
                    acc.push(mergeObj);

                    return acc;
                }, []);

                return {items};
            })
            .catch(_ => ({error: 'Failed to load ExtraInfo'}));
    }

    private getAnalystInfo(analysts: string[]): Promise<AnalystModel[]> {
        if (!analysts.length) {
            return Promise.resolve([]);
        }

        const reqOptions: IUdfReqOptions = {
            dataPointName: 'ADC',
            where: {
                ProductID: 'TOPNEWS:CPVIEWS',
                Universe: analysts.map(item => `${item}@analystcode`),
                Formulas: ['AnalystHover()'],
                startRow: 0,
                rowCount: 500
            }
        };

        return this.udf.post(reqOptions)
            .then((response: HttpResponse) => {
                const result = (response && response.body && response.body.ADC && response.body.ADC.r) || [];
                const analystData: AnalystMsfInfo[] = this.msfConverter(result);

                return analystData.map(item => ({
                    AnalystCode: item.Instrument,
                    AnalystPhone: item.AnalystPhoneNumber,
                    AnalystEmail: item.AnalystEmailAddress,
                    AnalystOverallEstStarRating: item.OverallEstStarRating,
                    AnalystOverallRecStarRating: item.OverallRecStarRating
                }));
            });
    }

    private msfConverter(response: any[]): any[] {
        const headers = [];
        const result = [];

        response.forEach((data, index) => {
            if (index === 0) {
                data.v.forEach(d => headers.push(d['___MSFVALUE'].replace(/\s+/g, '')));
            } else {
                const resultRow = {};
                for (let i = 0; i < headers.length; i++) {
                    resultRow[headers[i]] = data.v[i]['___MSFVALUE'];
                }
                result.push(resultRow);
            }
        });

        return result;
    }
}
