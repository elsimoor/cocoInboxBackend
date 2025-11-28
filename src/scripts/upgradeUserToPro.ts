import { connectToDatabase } from '../db'
import User from '../models/User'

// Manual script to upgrade a user to Pro status
// Usage: npx ts-node src/scripts/upgradeUserToPro.ts <email>

async function upgradeUserToPro(email: string) {
  try {
    await connectToDatabase()
    
    const user = await User.findOne({ email })
    if (!user) {
      console.log(`❌ User with email ${email} not found`)
      return
    }
    
    console.log(`📧 Found user: ${user.email}`)
    console.log(`🔍 Current status: is_pro=${user.is_pro}, roles=${user.roles}`)
    
    // Update to Pro
    user.is_pro = true
    user.subscriptionStatus = 'active'
    
    // Also add 'pro' to roles if not present
    if (!user.roles.includes('pro')) {
      user.roles.push('pro')
    }
    
    await user.save()
    
    console.log(`✅ User ${email} upgraded to Pro successfully!`)
    console.log(`🎉 New status: is_pro=${user.is_pro}, roles=${user.roles}, subscriptionStatus=${user.subscriptionStatus}`)
    
  } catch (error) {
    console.error('❌ Error upgrading user:', error)
  } finally {
    process.exit(0)
  }
}

// Get email from command line argument
const email = process.argv[2]
if (!email) {
  console.log('Usage: npx ts-node src/scripts/upgradeUserToPro.ts <email>')
  process.exit(1)
}

upgradeUserToPro(email)