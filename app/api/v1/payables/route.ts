import { debtRoutes } from '@/lib/debts'

const routes = debtRoutes('payable')

export const GET = routes.GET
export const POST = routes.POST
export const PATCH = routes.PATCH
export const DELETE = routes.DELETE
