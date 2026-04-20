/**
 * Input Validation Middleware
 * Validates request payloads against expected schemas and types
 */

import { Request, Response, NextFunction } from "express";

export interface ValidationError {
    field: string;
    message: string;
    code: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

/**
 * Validate login payload: { steam_id: number }
 */
export function validateLogin(req: Request): ValidationResult {
    const errors: ValidationError[] = [];
    const { steam_id } = req.body;

    if (steam_id === undefined || steam_id === null) {
        errors.push({
            field: "steam_id",
            message: "steam_id is required",
            code: "MISSING_FIELD",
        });
    } else if (typeof steam_id !== "number" && typeof steam_id !== "string") {
        errors.push({
            field: "steam_id",
            message: "steam_id must be a number or string",
            code: "INVALID_TYPE",
        });
    } else {
        const parsed = typeof steam_id === "string" ? parseInt(steam_id, 10) : steam_id;
        if (isNaN(parsed) || parsed <= 0) {
            errors.push({
                field: "steam_id",
                message: "steam_id must be a positive integer",
                code: "INVALID_VALUE",
            });
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate queue entry: { vs_type?: string; power_level?: number }
 */
export function validateQueueEntry(req: Request): ValidationResult {
    const errors: ValidationError[] = [];
    const { vs_type, power_level } = req.body;

    if (vs_type !== undefined && vs_type !== null) {
        if (typeof vs_type !== "string") {
            errors.push({
                field: "vs_type",
                message: "vs_type must be a string",
                code: "INVALID_TYPE",
            });
        }
        // vs_type will be validated against GameModes enum in handler
    }

    if (power_level !== undefined && power_level !== null) {
        if (typeof power_level !== "number") {
            errors.push({
                field: "power_level",
                message: "power_level must be a number",
                code: "INVALID_TYPE",
            });
        } else if (power_level < 0) {
            errors.push({
                field: "power_level",
                message: "power_level cannot be negative",
                code: "INVALID_VALUE",
            });
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate battle action: { unit_id: string; action: string; target_id?: string }
 */
export function validateBattleAction(req: Request): ValidationResult {
    const errors: ValidationError[] = [];
    const { unit_id, action, target_id } = req.body;

    if (!unit_id || typeof unit_id !== "string") {
        errors.push({
            field: "unit_id",
            message: "unit_id is required and must be a string",
            code: unit_id ? "INVALID_TYPE" : "MISSING_FIELD",
        });
    }

    if (!action || typeof action !== "string") {
        errors.push({
            field: "action",
            message: "action is required and must be a string",
            code: action ? "INVALID_TYPE" : "MISSING_FIELD",
        });
    } else if (!["move", "attack", "ability", "defend", "pass"].includes(action)) {
        errors.push({
            field: "action",
            message: "action must be one of: move, attack, ability, defend, pass",
            code: "INVALID_VALUE",
        });
    }

    if (target_id !== undefined && target_id !== null) {
        if (typeof target_id !== "string") {
            errors.push({
                field: "target_id",
                message: "target_id must be a string",
                code: "INVALID_TYPE",
            });
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate chat message: { message: string }
 */
export function validateChatMessage(req: Request): ValidationResult {
    const errors: ValidationError[] = [];
    const { message } = req.body;

    if (!message || typeof message !== "string") {
        errors.push({
            field: "message",
            message: "message is required and must be a string",
            code: message ? "INVALID_TYPE" : "MISSING_FIELD",
        });
    } else if (message.length === 0) {
        errors.push({
            field: "message",
            message: "message cannot be empty",
            code: "INVALID_VALUE",
        });
    } else if (message.length > 500) {
        errors.push({
            field: "message",
            message: "message cannot exceed 500 characters",
            code: "LENGTH_EXCEEDED",
        });
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Middleware that sends validation errors in standard format
 */
export function sendValidationError(res: Response, errors: ValidationError[]) {
    res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: errors,
    });
}
