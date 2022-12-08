import {CategoryEnum, IToken, Token} from '../../Model/PathToResource';
import {isRic} from '../../node_libs/news-utils/PathToResource';
import {service} from '../../Utils/PathToResource';
import {FeatureSwitch} from '../../Utils/PathToResource';
import * as _ from 'underscore';
import {Compiler, OperatorPriority} from '../../ExpressionAnalyzer/Compiler/PathToResource';
import {OperatorNormalizer, OperatorStrategy} from '../../ExpressionAnalyzer/Normalizer/PathToResource';

const MaxRicsByPortfolio = 100;

@service()
export class InfoEntitySelector {

    constructor(private featureSwitch: FeatureSwitch,
                private readonly compiler: Compiler,
                private readonly operatorNormalizer: OperatorNormalizer) {
    }

    public getPublicOrganisationAndLanguageTokens(tokens: Token[]): Token[] {
        const languages = this.getLanguages(tokens);
        const orgs = this.getPublicOrganisations(tokens);
        return this.operatorNormalizer.normalize(_.union(orgs, languages), OperatorStrategy.Smart);
    }

    // Get the languages from the tokens stream (not recursively)
    private getLanguages(tokens: Token[]): Token[] {
        return tokens.filter(token => token.category === CategoryEnum.Language);
    }

    private getPublicOrganisationTokensFromToken(token: Token): Token[] {
        // if it is an instrument then we don't proceed.
        if (!token || token.category == CategoryEnum.Instrument) {
            return [];
        }

        if (token.category == CategoryEnum.Organisation) {
            return [token];
        }

        // fall through operators and recursive portfolios but not instrument
        if (token.category == CategoryEnum.Operator || (token.children && token.children.length)) {
            return _.chain(token.children)
                .map(c => this.getPublicOrganisationTokensFromToken(c))
                .flatten()
                .uniq(item => item.id)
                .sortBy('label')
                .slice(0, MaxRicsByPortfolio)
                .value();
        }

        return [];
    }

    public getPublicOrganisations(tokens: Token[]): Token[] {
        const compiledToken = this.compiler.compile(tokens, OperatorPriority.Boolean);
        return this.getPublicOrganisationTokensFromToken(compiledToken);
    }
}
