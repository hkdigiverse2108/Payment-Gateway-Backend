"use strict"
import { Router } from 'express'
import { authRouter } from './auth'
import { userRouter } from './user'
import { transactionRouter } from './transaction'
import { walletRouter } from './wallet'
import { withdrawRouter } from './withdraw'
import { analyticsRouter } from './analytics'
import { developerRouter } from './developer'
import { userJWT } from '../helper'

const router = Router()

router.use('/auth', authRouter)

router.use(userJWT)
router.use('/user', userRouter)
router.use('/transaction', transactionRouter)
router.use('/wallet', walletRouter)
router.use('/withdraw', withdrawRouter)
router.use('/analytics', analyticsRouter)
router.use('/developer', developerRouter)

export { router }