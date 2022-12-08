import * as moment from 'moment';
import {service} from '../Utils/PathToResource';
import {ErrorEnum, NewsError as Error} from '../Error/PathToResource';
import {HttpResponse} from '../Http/PathToResource';
import {IUdfReqOptions, UdfService} from '../Utils/PathToResource';
import {removeRicPrefix} from '../node_libs/news-utils/PathToResource';
import {ITokenizer} from '../ExpressionAnalyzer/Tokenizer/PathToResource';
import {Description} from '../Model/PathToResource';
import {
    IRegistrationItems,
    ISignificantInfoModel,
    IOrganizationChartData,
    IOrganizationInfo,
    IOrgEventsItems,
    IOrgResearchItems,
    IStarmineModelScore,
    IStarmineModelScores
} from '../Model/IInfoOrganization';
import {StarMineScoreService} from './PathToResource';
import {RegistrationService} from './PathToResource';
import * as _ from 'lodash';
import {ICacheRepository} from '../Storage/PathToResource';
import {IInfoError} from '../Model/PathToResource';
import {SignificantInfoService} from './PathToResource';

const StarMineModels: { [key: string]: { name: string, request: string[] } } = {
    CombinedAlpha: {
        name: 'CombinedAlpha',
        request: ['TR.CombinedAlphaRegionRank(SDate=1D)', 'TR.CombinedAlphaRegionRank(SDate=-1D)']
    },
    AnalystRevisions: {name: 'AnalystRevisions', request: ['TR.ARM100Region', 'TR.ARM100RegionPrev']},
    Earnings: {name: 'Earnings', request: ['TR.EQCountryListRank_Latest', 'TR.EQCountryListRank_LatestPrev']},
    Valuation: {name: 'Valuation', request: ['TR.RelValRegionRank', 'TR.RelValRegionRankPrev']},
    IntrinsicValuation: {
        name: 'IntrinsicValuation',
        request: ['TR.IVPriceToIntrinsicValueCountryListRank', 'TR.IVPriceToIntrinsicValueCountryListRankPrev']
    },
    ValueMomentum: {name: 'ValueMomentum', request: ['TR.ValMoRegionRank', 'TR.ValMoRegionRankPrev']},
    PriceMomentum: {name: 'PriceMomentum', request: ['TR.PriceMoRegionRank', 'TR.PriceMoRegionRankPrev']}
};


const starMineCacheName = 'starmine';

const starMineTtl = 60 * 60 * 3; // 3 hours

@service()
export class InfoOrganizationService {
    constructor(private readonly udf: UdfService,
                private readonly symbologyTokenizer: ITokenizer,
                private readonly starMineScoreService: StarMineScoreService,
                private readonly registrationService: RegistrationService,
                private readonly significantInfoService: SignificantInfoService,
                private readonly cacheRepository: ICacheRepository) {
    }

    /**
     * Gets organization research data.
     *
     * @param {string} ric - Organization ric.
     * @param {string} dateFrom - Date from filter (date time string in ISO format).
     * @param {string} dateTo - Date to filter (date time string in ISO format).
     * @param {number} number - Limit of researches filter.
     * @returns {Promise<IOrgResearchItems | IInfoError>} Organization research items or error message.
     */
    public getResearchItems(ric: string, dateFrom: string, dateTo: string, number: number = 10): Promise<IOrgResearchItems | IInfoError> {
        if (!ric) {
            return InfoOrganizationService.createArgumentErrorPromise('Ric is not valid');
        }
        if (!dateFrom || !moment(dateFrom, moment.ISO_8601).isValid()) {
            return InfoOrganizationService.createArgumentErrorPromise('DateFrom is not valid');
        }
        if (!dateTo || !moment(dateTo, moment.ISO_8601).isValid()) {
            return InfoOrganizationService.createArgumentErrorPromise('DateTo is not valid');
        }
        const dateFromParts = dateFrom.split('.')[0].split('T');
        const dateToParts = dateTo.split('.')[0].split('T');

        // Payload description is here: http://upg-confluence.int.thomsonreuters.com/display/AL/Research
        return this.getTokenByRic(ric)
            .then(ticker => {
                const reqOptions: IUdfReqOptions = {
                    dataPointName: 'Res_PCWSREST_document',
                    where: {
                        reasons: [140000023, 140000014, 140000020, 140000027],
                        tkrEncoding: 'organizationPermId',
                        ticker: ticker.permId,
                        tkrPrimary: true,
                        searchDate: 'arriveDate',
                        dateRange: 'customDate',
                        dateFrom: dateFromParts[0],
                        timeFrom: dateFromParts[1],
                        dateTo: dateToParts[0],
                        timeTo: dateToParts[1],
                        maxRows: number,
                        sort: {
                            s_c: 'arriveDate',
                            s_d: 'desc'
                        }
                    }
                };

                return this.udf.post(reqOptions)
                    .then((response: HttpResponse) => {
                        const items = response.body.Res_PCWSREST_document && response.body.Res_PCWSREST_document.resp_search_1;
                        const researchItems = (items || []).map(item => ({
                            docID: item.docID,
                            date: item.arriveDate,
                            headline: item.headline
                        }));

                        return {items: researchItems};
                    })
                    .catch(() => {
                        return {error: 'Failed to load Organization Research items'};
                    });
            });
    }

    /**
     * Gets organization events data.
     *
     * @param {string} ric - Organization ric.
     * @param {string} dateFrom - Date from filter (date time string in ISO format).
     * @param {string} dateTo - Date to filter (date time string in ISO format).
     * @param {number} number - Limit of events filter.
     * @returns {Promise<IOrgEventsItems | IInfoError>} Organization events or error message.
     */
    public getEventItems(ric: string, dateFrom: string, dateTo: string, number: number = 10): Promise<IOrgEventsItems | IInfoError> {
        if (!ric) {
            return InfoOrganizationService.createArgumentErrorPromise('Ric is not valid');
        }
        if (!dateFrom || !moment(dateFrom, moment.ISO_8601).isValid()) {
            return InfoOrganizationService.createArgumentErrorPromise('DateFrom is not valid');
        }
        if (!dateTo || !moment(dateTo, moment.ISO_8601).isValid()) {
            return InfoOrganizationService.createArgumentErrorPromise('DateTo is not valid');
        }
        // Convert dates into EventApp compatible format (only date&time parts are accepted, ignore ms&timezone parts)
        dateFrom = dateFrom.split('.')[0];
        dateTo = dateTo.split('.')[0];

        // Payload description is here: http://upg-confluence.int.thomsonreuters.com/display/AL/Events
        return this.getTokenByRic(ric)
            .then(ticker => {
                const reqOptions: IUdfReqOptions = {
                    dataPointName: 'EPEvents',
                    where: {
                        size: number,
                        page: 0,
                        appId: 'EventApp',
                        sort: [{
                            field: 'DATE',
                            order: 'desc'
                        }],
                        fields: {
                            option: 'INCLUDE',
                            custom: ['Event', 'Derived'],
                            fields: [
                                'ALL'
                            ]
                        },
                        query: {
                            filter: [
                                {
                                    date: {
                                        label: 'DEFAULT',
                                        type: 'CUSTOM',
                                        endDate: dateTo,
                                        startDate: dateFrom
                                    },
                                    eventTypeLevel: {
                                        eventTypeLevel: 'ANY',
                                        levelId: [
                                            'E&C',
                                            'DIV',
                                            'INS',
                                            'CONF',
                                            'TRAN',
                                            'CA'
                                        ]
                                    },
                                    organization: {
                                        'permId': [ticker.permId]
                                    }
                                }, {
                                    date: {
                                        label: 'DEFAULT',
                                        type: 'CUSTOM',
                                        endDate: dateTo,
                                        startDate: dateFrom
                                    },
                                    eventTypeLevel: {
                                        eventTypeLevel: 'GROUP_LEVEL_1',
                                        levelId: [
                                            'DIV',
                                            'CA'
                                        ]
                                    },
                                    quote: {
                                        isPrimary: false
                                    },
                                    option: 'EXCLUDE'
                                }
                            ]
                        }
                    }
                };

                return this.udf.post(reqOptions)
                    .then((response: HttpResponse) => {
                        const events = response.body.EPEvents && response.body.EPEvents.events;
                        const eventItems = (events || []).map(item => ({
                            id: item.EventData.Event.EventId.Value,
                            type: item.EventData.Derived.GroupLevel1[0],
                            name: item.EventData.Event.DistinguishingEventName,
                            date: item.EventData.Derived.EventDate
                        }));

                        return {items: eventItems};
                    })
                    .catch(() => {
                        return {error: 'Failed to load Organization Events'};
                    });
            });
    }

    /**
     * Requests organization chart data.
     *
     * @param {string} ric - Organization ric.
     * @returns {Promise<IOrganizationChartData | IInfoError>} - Chart data or error message.
     */
    public getChartData(ric: string): Promise<IOrganizationChartData | IInfoError> {
        if (!ric) {
            return InfoOrganizationService.createArgumentErrorPromise('Ric is not valid');
        }

        const ricToRequest: string = removeRicPrefix(ric);
        const reqOptions: IUdfReqOptions = {
            dataPointName: 'TATimeSeries',
            where: {
                Tickers: [ricToRequest],
                NoInfo: true,
                Interval: 'Hourly',
                IntervalMultiplier: 1,
                DateRange: 'Day',
                DateRangeMultiplier: 2
            },
            id: 'sparkChart',
            customHeaders: [
                {name: 'X-Tr-Usecache', value: true},
                {name: 'X-Tr-Cachettl', value: 3600}
            ]
        };

        return this.udf.post(reqOptions)
            .then((response: HttpResponse) => {
                const responseData = response && response.body && response.body.sparkChart && response.body.sparkChart.R && response.body.sparkChart.R[0];

                if (!responseData || responseData.Ticker !== ricToRequest || !Array.isArray(responseData.Data)) {
                    return null;
                }

                let max, min: number;

                const points = responseData.Data
                    .map(data => {
                        let value: number = parseFloat(data.Close);
                        if (isNaN(value)) {
                            return;
                        }

                        if (max === undefined || value > max) {
                            max = value;
                        }

                        if (min === undefined || value < min) {
                            min = value;
                        }

                        return value;
                    })
                    .filter(point => !isNaN(point));

                if (max === undefined || min === undefined || points.length <= 1) {
                    // Data is not valid
                    return;
                }

                return <IOrganizationChartData>{
                    maxValue: max,
                    minValue: min,
                    points: points
                };
            })
            .catch(() => {
                return {error: 'Failed to load Organization Chart data'};
            });
    }

    /**
     * Requests Organization info.
     *
     * @param {string} ric - Organization ric.
     * @returns {Promise<IOrganizationInfo | IInfoError>} - Organization info or error message.
     */
    public getOrganizationInfo(ric: string): Promise<IOrganizationInfo | IInfoError> {
        if (!ric) {
            return InfoOrganizationService.createArgumentErrorPromise('Ric is not valid');
        }

        const reqOptions: IUdfReqOptions = {
            dataPointName: 'NavigationsV2',
            where: {
                Symbols: [removeRicPrefix(ric)],
                Scheme: 'RIC'
            },
            selectFields: ['Navigation_1_Response.Entity.Prop'],
            id: 'navigations'
        };
        return this.udf.post(reqOptions)
            .then((response: HttpResponse) => {
                const props = response && response.body && response.body.navigations && response.body.navigations[0] && response.body.navigations[0].Navigation_1_Response &&
                    response.body.navigations[0].Navigation_1_Response.Entity && response.body.navigations[0].Navigation_1_Response.Entity.Prop;

                if (!props || !Object.keys(props).length) {
                    return null;
                }

                let navData: { [key: string]: { value: string; Val: string; } } = Object.create(null);

                Object.keys(props).forEach(key => {
                    const prop = props[key];
                    const name = prop.name;
                    if (!name) {
                        return;
                    }

                    navData[name] = {value: prop.value, Val: prop.Val};
                });

                return <IOrganizationInfo>{
                    name: navData.SubjectName,
                    country: navData.RCSIssuerCountryLeaf,
                    countryCode: navData.RCSIssuerCountry,
                    exchange: navData.ExchangeName,
                    exchangeCode: navData.ExchangeCode,
                    exchangeCountry: navData.RCSExchangeCountry
                };
            })
            .catch(() => {
                return {error: 'Failed to load Organization Info'};
            });
    }

    /**
     * Requests StarMine model scores.
     *
     * @returns {Promise<IStarmineModelScores>}
     */
    public getStarmineModelScores(ric: string): Promise<IStarmineModelScores | IInfoError> {
        if (!ric) {
            return InfoOrganizationService.createArgumentErrorPromise('Ric is not valid');
        }

        return this.cacheRepository.get(starMineCacheName, ric)
            .catch(_ => null)
            .then(starMineValue => {
                if (starMineValue) {
                    return starMineValue;
                }
                const formulas: string[] = _.chain(StarMineModels)
                    .values().map(m => m.request).flatten().value();

                const reqOptions: IUdfReqOptions = {
                    dataPointName: 'ADC',
                    where: {
                        ProductID: 'TOPNEWS:CPVIEWS',
                        Universe: [`${removeRicPrefix(ric)}@RIC`],
                        Output: 'Col | Va, Row',
                        Formulas: formulas
                    }
                };

                return this.udf.post(reqOptions)
                    .then((response: HttpResponse) => {
                        const row: { v: { ___MSFVALUE: string }[] } = response && response.body && response.body.ADC && response.body.ADC.r && response.body.ADC.r[0];

                        if (row && row.v && row.v.length) {
                            let index = 0;
                            const significantScores: IStarmineModelScore[] = _.values(StarMineModels)
                                .reduce((accumulator: IStarmineModelScore[], model) => {
                                    const currentScoreValue: { ___MSFVALUE: string } = row.v[index++];
                                    const previousScoreValue: { ___MSFVALUE: string } = row.v[index++];
                                    if (!currentScoreValue || !previousScoreValue) {
                                        return accumulator;
                                    }

                                    const currentScore: number = parseInt(currentScoreValue.___MSFVALUE, 10);
                                    const previousScore: number = parseInt(previousScoreValue.___MSFVALUE, 10);
                                    const direction: number = this.starMineScoreService.getStarMineDirection(currentScore, previousScore);

                                    if (direction != 0) {
                                        const starminemidelScore: IStarmineModelScore = {
                                            model: model.name,
                                            currentScore,
                                            previousScore,
                                            direction
                                        };
                                        accumulator.push(starminemidelScore);
                                    }

                                    return accumulator;
                                }, []);

                            const starMine = {scores: significantScores};
                            this.cacheRepository.set(starMineCacheName, ric, starMine, starMineTtl);
                            return starMine;
                        } else {
                            return {error: 'Failed to load StarMine Model Scores'};
                        }
                    })
                    .catch(_ => {
                        return {error: 'Failed to load StarMine Model Scores'};
                    });
            });
    }

    /**
     * Gets Registration data.
     *
     * @returns {Promise<IRegistrationItems | IInfoError>} Registration data or error message.
     */
    public getRegistration(ric: string, dateFrom: string, dateTo: string): Promise<IRegistrationItems | IInfoError> {
        if (!ric) {
            return InfoOrganizationService.createArgumentErrorPromise('Ric is not valid');
        }
        if (!dateFrom || !moment(dateFrom, moment.ISO_8601).isValid()) {
            return InfoOrganizationService.createArgumentErrorPromise('DateFrom is not valid');
        }
        if (!dateTo || !moment(dateTo, moment.ISO_8601).isValid()) {
            return InfoOrganizationService.createArgumentErrorPromise('DateTo is not valid');
        }

        return this.getTokenByRic(ric)
            .then(ticker => {
                return this.registrationService.getRegistration(ticker.permId, dateFrom, dateTo);
            });
    }

    /**
     * Get Financial Highlights data
     *
     * @returns {Promise<ISignificantInfoModel | IInfoError>} SignificantInfo data or error message.
     */
    public getSignificantInfo(ric: string): Promise<ISignificantInfoModel | IInfoError> {
        if (!ric) {
            return InfoOrganizationService.createArgumentErrorPromise('Ric is not valid');
        }

        return this.significantInfoService.getSignificantInfo(ric);
    }

    private getTokenByRic(ric: string): Promise<Description> {
        return this.symbologyTokenizer.tokenize([ric])
            .then(ticker => (
                Promise.resolve((ticker && ticker[ric]) || {})
            ))
            .catch(err => Promise.reject({error: 'Failed to parse ric into token'}));
    }

    private static createArgumentErrorPromise(message: string): Promise<never> {
        return Promise.reject(new Error(ErrorEnum.ArgumentError, message));
    }
}
