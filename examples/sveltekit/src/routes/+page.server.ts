import { history } from '#lib/server/answers.ts'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = () => ({ history })
