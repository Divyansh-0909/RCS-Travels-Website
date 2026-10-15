import { Router } from 'express'
import type { Response } from 'express'
import { getAuth } from '@clerk/express'
import { z } from 'zod'
import { protect, protectAdmin } from '../middleware/auth.js'
import { getResponsibilityReviewContext, reviewResponsibilityCase } from '../services/responsibilityReviewService.js'
import { reviewResponsibilityAppeal } from '../services/responsibilityAppealService.js'
import { ResponsibilityLifecycleError } from '../services/responsibilityLifecycleErrors.js'
import { responsibilityClassification } from '../services/responsibilityContracts.js'
import { responsibilityConsequenceLevel } from '../services/responsibilityFinalizationService.js'
import {
    DriverReliabilityError,
    getDriverReliabilityState,
    removeIndefiniteReliabilityBlock,
} from '../services/driverReliability.js'
import {
    getResponsibilityAdjudicationHealth,
    retryResponsibilityShadowCase,
} from '../services/responsibilityShadowAdjudication.js'

const responsibilityAdminRouter = Router()

const caseParamsSchema = z.object({ caseId: z.string().trim().min(1).max(200) }).strict()
const driverParamsSchema = z.object({ driverId: z.string().trim().min(1).max(200) }).strict()
const reliabilityBlockParamsSchema = z.object({
    driverId: z.string().trim().min(1).max(200),
    blockId: z.string().trim().min(1).max(200),
}).strict()
const consequenceLevelSchema = z.enum(Object.values(responsibilityConsequenceLevel) as [string, ...string[]])
const responsibilityDecisionFields = {
    evidenceVersion: z.string().trim().min(1).max(200),
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    classification: z.enum(Object.values(responsibilityClassification) as [string, ...string[]]).nullable().optional(),
    consequenceLevel: consequenceLevelSchema.nullable().optional(),
    reason: z.string().trim().min(3).max(2000),
} as const

function addDecisionCompatibilityIssues(
    decision: 'UPHOLD' | 'WAIVE',
    classification: string | null | undefined,
    context: z.RefinementCtx,
): void {
    if (decision === 'UPHOLD' && classification !== responsibilityClassification.DRIVER_CAUSED) {
        context.addIssue({ code: 'custom', path: ['classification'], message: 'Classification is required for upheld decisions' })
    }
    if (decision === 'WAIVE' && classification === responsibilityClassification.DRIVER_CAUSED) {
        context.addIssue({ code: 'custom', path: ['classification'], message: 'Driver-caused classification is incompatible with waiver' })
    }
}

const reviewBodySchema = z.object({
    decision: z.enum(['UPHOLD', 'WAIVE']),
    ...responsibilityDecisionFields,
}).strict().superRefine((body, context) => {
    addDecisionCompatibilityIssues(body.decision, body.classification, context)
})
const appealReviewBodySchema = z.object({
    outcome: z.enum(['UPHOLD', 'WAIVE']),
    ...responsibilityDecisionFields,
}).strict().superRefine((body, context) => {
    addDecisionCompatibilityIssues(body.outcome, body.classification, context)
})

function normalizedDecisionDetails(body: z.infer<typeof reviewBodySchema> | z.infer<typeof appealReviewBodySchema>) {
    return {
        expectedEvidence: { version: body.evidenceVersion, hash: body.evidenceHash },
        reason: body.reason,
        classification: body.classification ?? null,
        consequenceLevel: body.consequenceLevel ?? null,
    }
}

function answerResponsibilityError(res: Response, error: ResponsibilityLifecycleError): void {
    res.status(error.status).json({ error: error.message, code: error.code })
}

function answerReliabilityError(res: Response, error: DriverReliabilityError): void {
    const status = error.code === 'DRIVER_NOT_FOUND' || error.code === 'BLOCK_NOT_FOUND' ? 404 : 400
    res.status(status).json({ error: error.message, code: error.code })
}

responsibilityAdminRouter.get('/cases/:caseId', protect, protectAdmin, async (req, res) => {
    const params = caseParamsSchema.safeParse(req.params)
    if (!params.success) return res.status(400).json({ error: 'Invalid responsibility case id', issues: params.error.issues })
    try {
        return res.json(await getResponsibilityReviewContext(params.data.caseId))
    } catch (error) {
        if (error instanceof ResponsibilityLifecycleError) {
            answerResponsibilityError(res, error)
            return
        }
        throw error
    }
})

responsibilityAdminRouter.post('/cases/:caseId/shadow/retry', protect, protectAdmin, async (req, res) => {
    const params = caseParamsSchema.safeParse(req.params)
    if (!params.success) return res.status(400).json({ error: 'Invalid responsibility case id', issues: params.error.issues })
    const result = await retryResponsibilityShadowCase(params.data.caseId)
    if (result.status === 'CASE_NOT_FOUND') return res.status(404).json(result)
    if (result.status === 'RETRY_LIMIT') return res.status(409).json(result)
    return res.json(result)
})

responsibilityAdminRouter.get('/adjudication/health', protect, protectAdmin, async (_req, res) => {
    return res.json(await getResponsibilityAdjudicationHealth())
})

responsibilityAdminRouter.post('/cases/:caseId/review', protect, protectAdmin, async (req, res) => {
    const params = caseParamsSchema.safeParse(req.params)
    const body = reviewBodySchema.safeParse(req.body)
    if (!params.success || !body.success) return res.status(400).json({ error: 'Invalid admin review request' })
    try {
        return res.json(await reviewResponsibilityCase({
            caseId: params.data.caseId,
            adminActorId: getAuth(req).userId,
            decision: body.data.decision,
            ...normalizedDecisionDetails(body.data),
        }))
    } catch (error) {
        if (error instanceof ResponsibilityLifecycleError) {
            answerResponsibilityError(res, error)
            return
        }
        throw error
    }
})

responsibilityAdminRouter.post('/cases/:caseId/appeal-review', protect, protectAdmin, async (req, res) => {
    const params = caseParamsSchema.safeParse(req.params)
    const body = appealReviewBodySchema.safeParse(req.body)
    if (!params.success || !body.success) return res.status(400).json({ error: 'Invalid appeal review request' })
    try {
        return res.json(await reviewResponsibilityAppeal({
            caseId: params.data.caseId,
            reviewerId: getAuth(req).userId,
            outcome: body.data.outcome,
            ...normalizedDecisionDetails(body.data),
        }))
    } catch (error) {
        if (error instanceof ResponsibilityLifecycleError) {
            answerResponsibilityError(res, error)
            return
        }
        throw error
    }
})

responsibilityAdminRouter.get('/drivers/:driverId/reliability', protect, protectAdmin, async (req, res) => {
    const params = driverParamsSchema.safeParse(req.params)
    if (!params.success) return res.status(400).json({ error: 'Invalid driver id', issues: params.error.issues })
    try {
        return res.json(await getDriverReliabilityState(params.data.driverId))
    } catch (error) {
        if (error instanceof DriverReliabilityError) {
            answerReliabilityError(res, error)
            return
        }
        throw error
    }
})

responsibilityAdminRouter.post('/drivers/:driverId/reliability-blocks/:blockId/remove', protect, protectAdmin, async (req, res) => {
    const params = reliabilityBlockParamsSchema.safeParse(req.params)
    const body = z.object({ reason: z.string().trim().min(3).max(2000) }).strict().safeParse(req.body)
    if (!params.success || !body.success) return res.status(400).json({ error: 'Invalid reliability block removal request' })
    try {
        return res.json(await removeIndefiniteReliabilityBlock({
            driverId: params.data.driverId,
            blockId: params.data.blockId,
            adminActorId: getAuth(req).userId,
            reason: body.data.reason,
        }))
    } catch (error) {
        if (error instanceof DriverReliabilityError) {
            answerReliabilityError(res, error)
            return
        }
        throw error
    }
})

export default responsibilityAdminRouter
