import {service} from '../Utils/PathToResource';
import {IUdfReqOptions, UdfService} from '../Utils/PathToResource';
import {HttpResponse} from '../Http/PathToResource';
import {ISignificantInfoModel} from '../Model/PathToResource';
import * as _ from 'underscore';
import * as moment from 'moment';
import {IInfoError} from '../Model/PathToResource';

export type IStarmineDataItemType = 'sm_arrival_date_y0'
    | 'sm_arrival_date_s0'
    | 'sm_arrival_date_q0'
    | 'security_country_code'
    | 'eq_accruals_period_type_d0'
    | 'sm_new_trigger_date_d0';

export interface IStarmineSignificantInfo {
    DataItemSet: {
        DataItem: {
            DataItemRefId: number;
            Identifier: number;
            Name: IStarmineDataItemType;
        }[];
        IdType: 'STARMINE' | string
    };
    DataItemSetResponse: {
        DataItemValue: {
            DataItemRefId: number;
            SecurityRefId: number;
            Value: string;
            ValueDataType: string;
        }[]
    }
    SecuritySet: {
        Security: {
            IdType: string;
            Identifier: string;
            SecurityRefId: number;
        }[]
    }
}

export interface IHighlightModel {
    PeriodType: 'y' | 's' | 'q',
    Id: number,
    ___MSFVALUE: string
}

export interface ISecurityHighlightsModel {
    Security: {
        SecurityRefId: number,
        Identifier: {
            dType: string,
            ___MSFVALUE: string
        }
    },
    HighlightsSet: {
        Highlight: IHighlightModel[]
    }
}

export interface IFundamentalHighlightsSet {
    SecurityHighlights: ISecurityHighlightsModel[]
}

export type IStarmineValueType = {
    [k in IStarmineDataItemType]?: string
    }

export interface IHighlightsModel {
    periodType: string;
    value: string
}

export interface IStarmineModel {
    isNorthAmerica?: boolean;
    date?: Date;
    annualDate?: Date;
    semiAnnualDate?: Date;
    quarterlyDate?: Date;
}

enum DatePeriodEnum {
    Annual = 'y',
    SemiAnnual = 's',
    Quarterly = 'q'
}

@service()
export class SignificantInfoService {
    constructor(private readonly udf: UdfService) {
    }

    public getSignificantInfo(ric: string): Promise<ISignificantInfoModel | IInfoError> {
        return Promise.all([
            this.getPanFundamentalHighlights(ric),
            this.getStarmineDataItems(ric)
        ])
            .then(([highlights, starmineData]: [IHighlightsModel[] | IInfoError, IStarmineModel | IInfoError]) => {
                    if ((highlights as IInfoError).error) {
                        return highlights as IInfoError;
                    }

                    if ((starmineData as IInfoError).error) {
                        return starmineData as IInfoError;
                    }

                    return SignificantInfoService.calculateActivity(
                        highlights as IHighlightsModel[],
                        starmineData as IStarmineModel
                    );
                }
            ).catch(_ => {
                return {error: 'Failed to load SignificantInfo'};
            });
    }

    private getPanFundamentalHighlights(ric: string): Promise<IHighlightsModel[] | IInfoError> {
        const reqOptions: IUdfReqOptions = {
            dataPointName: 'PanFundamentalHighlights',
            where: {
                SecuritySet: [{'Id': ric}],
                startRow: 0,
                rowCount: 500
            }
        };

        return this.udf.post(reqOptions)
            .then((response: HttpResponse) => {
                const highlights: IHighlightModel[] = response && response.body
                    && response.body.PanFundamentalHighlights
                    && response.body.PanFundamentalHighlights.PersistentAnalytics_GetFundamentalHighlightsResponse_1_0
                    && response.body.PanFundamentalHighlights.PersistentAnalytics_GetFundamentalHighlightsResponse_1_0
                        .FundamentalHighlightsSet
                    && response.body.PanFundamentalHighlights.PersistentAnalytics_GetFundamentalHighlightsResponse_1_0
                        .FundamentalHighlightsSet.SecurityHighlights
                    && response.body.PanFundamentalHighlights.PersistentAnalytics_GetFundamentalHighlightsResponse_1_0
                        .FundamentalHighlightsSet.SecurityHighlights[0]
                    && response.body.PanFundamentalHighlights.PersistentAnalytics_GetFundamentalHighlightsResponse_1_0
                        .FundamentalHighlightsSet.SecurityHighlights[0].HighlightsSet
                    && response.body.PanFundamentalHighlights.PersistentAnalytics_GetFundamentalHighlightsResponse_1_0
                        .FundamentalHighlightsSet.SecurityHighlights[0].HighlightsSet.Highlight;

                if (!highlights || !highlights.length) {
                    return {error: 'No data for PanFundamentalHighlights'};
                }

                return highlights.map((item) => ({periodType: item.PeriodType, value: item.___MSFVALUE}));
            })
            .catch(_ => {
                return {error: 'Failed to load PanFundamentalHighlights'};
            });
    }

    private getStarmineDataItems(ric: string): Promise<IStarmineModel | IInfoError> {
        const reqOptions: IUdfReqOptions = {
            dataPointName: 'Starmine',
            where: {
                startRow: 0,
                rowCount: 500,
                'DataItemSet': {
                    'DataItems': [
                        {
                            'Identifier': '2319919943',
                            'Name': 'sm_arrival_date_y0'
                        },
                        {
                            'Identifier': '1890108365',
                            'Name': 'sm_arrival_date_s0'
                        },
                        {
                            'Identifier': '1117692239',
                            'Name': 'sm_arrival_date_q0'
                        },
                        {
                            'Identifier': '3400746469',
                            'Name': 'security_country_code'
                        },
                        {
                            'Identifier': '1316416825',
                            'Name': 'eq_accruals_period_type_d0'
                        },
                        {
                            'Identifier': '996485465',
                            'Name': 'sm_new_trigger_date_d0'
                        }
                    ]
                },
                'Securities': [
                    {
                        'Identifier': {
                            'Id': ric,
                            'IdType': 'RIC'
                        }
                    }
                ]
            }
        };

        return this.udf.post(reqOptions)
            .then((response: HttpResponse) => {
                const starmineSignificantInfo: IStarmineSignificantInfo = response
                    && response.body
                    && response.body.Starmine
                    && response.body.Starmine.PersistentAnalytics_GetDataItemSetResponse_1_0;
                const securityItems = starmineSignificantInfo
                    && starmineSignificantInfo.SecuritySet
                    && starmineSignificantInfo.SecuritySet.Security;
                const dataItems = starmineSignificantInfo
                    && starmineSignificantInfo.DataItemSet
                    && starmineSignificantInfo.DataItemSet.DataItem;
                const dataItemValues = starmineSignificantInfo
                    && starmineSignificantInfo.DataItemSetResponse
                    && starmineSignificantInfo.DataItemSetResponse.DataItemValue;

                if (!Array.isArray(securityItems) || !securityItems.length
                    || !Array.isArray(dataItems) || !dataItems.length
                    || !Array.isArray(dataItemValues) || !dataItemValues.length) {
                    return {error: 'No data for Starmine'};
                }

                const securityItem = securityItems[0];
                const values: IStarmineValueType = {} as IStarmineValueType;
                const resultItem: any = {};

                dataItems.forEach((dataItem) => {
                    const dataItemValue = _.find(dataItemValues, function (v) {
                        return v.DataItemRefId == dataItem.DataItemRefId && v.SecurityRefId == securityItem.SecurityRefId;
                    });

                    if (dataItemValue) {
                        values[dataItem.Name] = dataItemValue.Value;
                    }

                });

                resultItem.isNorthAmerica = SignificantInfoService.isNorthAmerica(values.security_country_code);

                if (!resultItem.isNorthAmerica) {
                    resultItem.annualDate = SignificantInfoService.adjustArrivalDate(values.sm_arrival_date_y0);
                    resultItem.semiAnnualDate = SignificantInfoService.adjustArrivalDate(values.sm_arrival_date_s0);
                    resultItem.quarterlyDate = SignificantInfoService.adjustArrivalDate(values.sm_arrival_date_q0);
                }
                else {
                    resultItem.date = values.eq_accruals_period_type_d0 === DatePeriodEnum.Annual
                        ? SignificantInfoService.adjustArrivalDate(values.sm_arrival_date_y0)
                        : SignificantInfoService.adjustArrivalDate(values.sm_arrival_date_q0);
                }

                return resultItem;
            })
            .catch(_ => {
                return {error: 'Failed to load Starmine'};
            });
    }

    private static isNorthAmerica(securityCountryCode: string): boolean {
        return /^(CN|US)$/.test(securityCountryCode);
    };

    public static adjustArrivalDate(arrivalDate: string): Date {
        if (arrivalDate) {
            const utcArrivalDate = moment.utc(arrivalDate);

            switch (utcArrivalDate.isoWeekday()) {
                case 0: // Sunday
                case 1: // Monday
                case 2: // Tuesday
                case 3: // Wednesday
                case 4: // Thursday
                    utcArrivalDate.add(1, 'days');
                    break;
                case 5: // Friday
                    utcArrivalDate.add(3, 'days');
                    break;
                case 6: // Saturday
                    utcArrivalDate.add(2, 'days');
                    break;
            }

            return moment(utcArrivalDate.local()).toDate();
        }

        return null;
    };

    private static calculateActivity(highlights: IHighlightsModel[], starmineData: IStarmineModel): ISignificantInfoModel | IInfoError {
        if (!starmineData) {
            return {error: 'Failed to load SignificantInfo'};
        }

        const sourceDate = starmineData.date
            || starmineData.quarterlyDate
            || starmineData.semiAnnualDate
            || starmineData.annualDate;
        if (!sourceDate) {
            return {error: 'Failed to load SignificantInfo'};
        }

        let significantInfoItem: ISignificantInfoModel = null;

        if (moment().subtract(2, 'days').isBefore(sourceDate)) {
            const northAmerica = starmineData.isNorthAmerica;
            significantInfoItem = {
                northAmerica,
                annualDate: northAmerica
                    ? sourceDate
                    : starmineData.annualDate,
                semiAnnualDate: starmineData.semiAnnualDate,
                quarterlyDate: starmineData.quarterlyDate
            };

            (highlights as IHighlightsModel[]).forEach((highlight) => {
                if (highlight.periodType === DatePeriodEnum.Annual || significantInfoItem.northAmerica) {
                    significantInfoItem.annualHighlights = significantInfoItem.annualHighlights || [];
                    significantInfoItem.annualHighlights.push(highlight.value);
                }

                if (highlight.periodType === DatePeriodEnum.SemiAnnual && !significantInfoItem.northAmerica) {
                    significantInfoItem.semiAnnualHighlights = significantInfoItem.semiAnnualHighlights || [];
                    significantInfoItem.semiAnnualHighlights.push(highlight.value);
                }

                if (highlight.periodType === DatePeriodEnum.Quarterly && !significantInfoItem.northAmerica) {
                    significantInfoItem.quarterlyHighlights = significantInfoItem.quarterlyHighlights || [];
                    significantInfoItem.quarterlyHighlights.push(highlight.value);
                }
            });
        }

        return significantInfoItem;
    };
}
