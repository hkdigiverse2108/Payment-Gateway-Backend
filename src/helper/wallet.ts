import { userModel, walletActivityModel } from '../database';
import { createData, redisDelPattern } from './database-service';
import { WALLET_ACTIVITY_TYPE } from '../common';

interface CreditWalletParams {
    userId: any;
    transactionId: any;
    amount: number;
    orderId: string;
    brand?: string;
}

export const creditUserWallet = async ({
    userId,
    transactionId,
    amount,
    orderId,
    brand
}: CreditWalletParams) => {

    const user = await userModel.findById(userId);
    if (!user) return null;
    const previousBalance = user.walletBalance || 0;

    await userModel.updateOne(
        { _id: userId },
        { $inc: { walletBalance: amount } }
    );

    const updatedUser = await userModel.findById(userId);

    await createData(walletActivityModel, {
        userId,
        transactionId,
        type: WALLET_ACTIVITY_TYPE.CREDIT,
        amount,
        previousBalance,
        newBalance: updatedUser?.walletBalance || previousBalance,
        description: `Wallet credited for deposit ${orderId}`,
        brand
    });
    await redisDelPattern(`wallet:balance:${userId}`);
    await redisDelPattern(`wallet:activity:${userId}:*`);
    return updatedUser;
};