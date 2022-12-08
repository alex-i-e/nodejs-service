import * as _ from 'lodash';
import {service} from '../Utils/PathToResource';
import {IUdfReqOptions, UdfService} from '../Utils/PathToResource';
import {HttpResponse} from '../Http/PathToResource';
import {IRegistrationItems, IRegistrationModel} from '../Model/PathToResource';
import {IInfoError} from "../Model/PathToResource';

enum FilingCategory {
    CompanyPeriodicReports = 'Company Periodic Reports',
    CompanySignificantEventPressReleases = 'Company Significant Event/Press Releases',
    RegistrationStatements = 'Registration Statements',
    OwnershipStatements = 'Ownership Statements',
    FixedIncomeProspectuses = 'Fixed Income Prospectuses',
    GeneralProspectuses = 'General Prospectuses',
    MergersAndAcquisitions = 'Mergers And Acquisitions',
    SecurityPurchases = 'Security Purchases',
    Other = 'Other'
}

interface ICompanyInfo {
    AsReportedName: string;
    CIK?: string;
    OAPermID?: string;
    Role?: string;
    SICCode?: string;
    mxid?: string;
}

interface ISubmissionInfo {
    DCN?: string;
    accessionNumber?: string;
    arriveDate: string;
    categoryID: number;
    commonID: string;
    companyInfo: ICompanyInfo[];
    countryCode?: string;
    feedID?: string;
    fileType?: string;
    formName?: string;
    formType?: string;
    isRestricted?: boolean;
    languageCode?: string;
    originalFileName?: string;
    periodEndDate?: string;
    releaseDate?: string;
    size?: number;
}

interface ISubmissionStatusAndInfo {
    commonID: string; // DocumentID
    documentTitle?: string;
    docType?: string;
    submissionInfo: ISubmissionInfo[];
}

export interface IEsRegistration {
    ESindexServer?: string;
    resultSize: number;
    submissionStatusAndInfo: ISubmissionStatusAndInfo[];
    totalHit?: number;
}

const ALLOWED_CATEGORIES: string[] = [
    FilingCategory.CompanyPeriodicReports,
    FilingCategory.RegistrationStatements,
    FilingCategory.SecurityPurchases,
    FilingCategory.MergersAndAcquisitions,
];
const CATEGORIES = [
    {
        categoryName: FilingCategory.CompanyPeriodicReports,
        MidLevelCategories: [1, 12, 21, 22, 26, 32, 33, 40, 42, 50, 52]
    },
    {
        categoryName: FilingCategory.CompanySignificantEventPressReleases,
        MidLevelCategories: [2, 3, 39, 41, 46, 51, 53, 55, 56, 57]
    },
    {
        categoryName: FilingCategory.RegistrationStatements,
        MidLevelCategories: [3, 23, 24, 25, 27, 28, 29, 30, 36]
    },
    {
        categoryName: FilingCategory.OwnershipStatements,
        MidLevelCategories: [4, 16, 43, 59]
    },
    {
        categoryName: FilingCategory.FixedIncomeProspectuses,
        MidLevelCategories: [5, 18, 44, 45]
    },
    {
        categoryName: FilingCategory.GeneralProspectuses,
        MidLevelCategories: [6, 19, 20, 31, 37, 38]
    },
    {
        categoryName: FilingCategory.MergersAndAcquisitions,
        MidLevelCategories: [7, 9, 17]
    },
    {
        categoryName: FilingCategory.SecurityPurchases,
        MidLevelCategories: [7, 8, 34, 35, 47, 48, 49, 54]
    },
    {
        categoryName: FilingCategory.Other,
        MidLevelCategories: [9, 6, 10, 11, 13, 14, 15, 58, 60]
    }
];

@service()
export class RegistrationService {
    constructor(private readonly udf: UdfService) {
    }

    public getRegistration(permId: string, dateFrom: string, dateTo: string): Promise<IRegistrationItems | IInfoError> {
        const reqOptions: IUdfReqOptions = {
            dataPointName: 'EsRegistration',
            where: {
                OAPermID: [permId],
                dateRangeOption: 'dateRange',
                dateFrom,
                dateTo,
                startRow: 0,
                rowCount: 500
            }
        };

        return this.udf.post(reqOptions)
            .then((response: HttpResponse) => {
                const esRegistration: IEsRegistration = response && response.body && response.body.EsRegistration;
                if (esRegistration.resultSize === 0) {
                    return {items: []};
                }
                const submissions: ISubmissionStatusAndInfo[] = esRegistration.submissionStatusAndInfo;
                if (submissions) {
                    const items = submissions
                        .filter(submissionStatusAndInfo => (this.validateSubmission(submissionStatusAndInfo)))
                        .map(submissionStatusAndInfo => (this.getModel(submissionStatusAndInfo)));
                    return {items};
                } else {
                    return {error: 'Failed to load Registration'};
                }
            })
            .catch(_ => {
                return {error: 'Failed to load Registration'};
            });
    }

    private validateSubmission(submissionStatusAndInfo: ISubmissionStatusAndInfo): boolean {
        const submissionInfo = submissionStatusAndInfo && submissionStatusAndInfo.submissionInfo && submissionStatusAndInfo.submissionInfo[0];
        if (!submissionInfo) {
            return false;
        }
        const categoryName = this.getCategoryName(submissionInfo.categoryID);
        return !!categoryName;
    }

    private getModel(submissionStatusAndInfo: ISubmissionStatusAndInfo): IRegistrationModel {
        const submissionInfo = submissionStatusAndInfo.submissionInfo && submissionStatusAndInfo.submissionInfo[0];

        let headline;
        if (submissionStatusAndInfo.documentTitle) {
            headline = submissionStatusAndInfo.documentTitle;
        } else {
            headline = submissionInfo.companyInfo
                .filter(info => (!!info.AsReportedName))
                .map(info => (info.AsReportedName))
                .join(', ');
            if (submissionInfo.formName) {
                headline += `${headline ? ' - ' : ''}${submissionInfo.formName}`;
            }
        }
        return {
            headline,
            category: this.getCategoryName(submissionInfo.categoryID),
            arriveDate: submissionInfo.arriveDate,
            documentId: submissionInfo.commonID
        };
    }

    private getCategoryName(categoryID: number): string {
        const categories = this.getCategoriesById(categoryID);
        return _.find(categories, category => {
            return _.some(ALLOWED_CATEGORIES, allowedCategory => category === allowedCategory);
        });
    }

    /**
     * Gets all possible categories by `categoryId` (there are can be few categories with the same mid level ID).
     * @param categoryID - Category ID.
     */
    private getCategoriesById(categoryID: number): string[] {
        const categories: string[] = [];
        CATEGORIES.forEach(category => {
            if (category.MidLevelCategories.indexOf(categoryID) > -1) {
                categories.push(category.categoryName);
            }
        });
        return categories;
    }
}
