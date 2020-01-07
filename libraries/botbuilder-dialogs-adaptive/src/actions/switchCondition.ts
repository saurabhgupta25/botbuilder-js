/**
 * @module botbuilder-dialogs-adaptive
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { DialogTurnResult, DialogConfiguration, DialogDependencies, Dialog, DialogContext } from 'botbuilder-dialogs';
import { Expression, ExpressionEngine } from 'botframework-expressions';
import { SequenceContext } from '../sequenceContext';
import { ActionScope } from './actionScope';
import { Case } from './case';

export interface SwitchConditionConfiguration extends DialogConfiguration {
    condition?: string;
    default?: Dialog[];
    cases?: Case[];
    defaultScope?: ActionScope;
}

export class SwitchCondition<O extends object = {}> extends Dialog<O> implements DialogDependencies {

    public static declarativeType = 'Microsoft.SwitchCondition';

    public constructor();
    public constructor(condition: string, defaultDialogs: Dialog[], cases: Case[]);
    public constructor(condition?: string, defaultDialogs?: Dialog[], cases?: Case[]) {
        super();
        if (condition) { this.condition = condition; }
        if (defaultDialogs) { this.default = defaultDialogs; }
        if (cases) { this.cases = cases; }
    }

    private _caseExpresssions: any;

    private _condition: Expression;

    private _defaultScope: ActionScope;

    /**
     * Get condition expression against memory.
     */
    public get condition(): string {
        return this._condition ? this._condition.toString() : undefined;
    }

    /**
     * Set condition expression against memory.
     */
    public set condition(value: string) {
        this._condition = value ? new ExpressionEngine().parse(value) : undefined;
    }

    /**
     * Default case.
     */
    public default: Dialog[] = [];

    /**
     * Cases.
     */
    public cases: Case[] = [];

    public getDependencies(): Dialog[] {
        let dialogs: Dialog[] = [];
        if (this.default) {
            dialogs = dialogs.concat(this.defaultScope);
        }

        if (this.cases) {
            dialogs = dialogs.concat(this.cases);
        }
        return dialogs;
    }

    public configure(config: SwitchConditionConfiguration): this {
        for (const key in config) {
            if (config.hasOwnProperty(key)) {
                const value = config[key];
                switch (key) {
                    case 'cases':
                        this.cases = (value as Case[]).map(v => new Case(v.value, v.actions));
                        break;
                    default:
                        super.configure({ [key]: value });
                        break;
                }
            }
        }

        return this;
    }

    public async beginDialog(dc: DialogContext, options?: O): Promise<DialogTurnResult> {
        if (dc instanceof SequenceContext) {
            if (!this._caseExpresssions) {
                this._caseExpresssions = {};
                for (let i = 0; i < this.cases.length; i++) {
                    const caseScope = this.cases[i];
                    const caseCondition = Expression.equalsExpression(this._condition, caseScope.createValueExpression());
                    this._caseExpresssions[caseScope.value] = caseCondition;
                }
            }

            let actionScope = this.defaultScope;

            for (let i = 0; i < this.cases.length; i++) {
                const caseScope = this.cases[i];
                const caseCondition = this._caseExpresssions[caseScope.value] as Expression;
                const { value, error } = caseCondition.tryEvaluate(dc.state);
                if (error) {
                    throw new Error(`Expression evaluation resulted in an error. Expression: ${ caseCondition.toString() }. Error: ${ error }`);
                }

                if (!!value) {
                    actionScope = caseScope;
                }
            }

            return await dc.replaceDialog(actionScope.id);
        } else {
            throw new Error('`SwitchCondition` should only be used in the context of an adaptive dialog.');
        }
    }

    protected get defaultScope(): ActionScope {
        if (!this._defaultScope) {
            this._defaultScope = new ActionScope(this.default);
        }
        return this._defaultScope;
    }

    protected onComputeId(): string {
        return `SwitchCondition[${ this.condition }]`;
    }
}