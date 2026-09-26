import { prisma } from './client';
import { initAuthInstance } from '../../src/lib/auth';

const auth = initAuthInstance(prisma);

async function main() {
  console.log('🌱 Seeding database...');

  const existingUser = await prisma.user.findUnique({
    where: { email: 'admin@example.com' },
  });

  if (!existingUser) {
    const { user } = await auth.api.signUpEmail({
      body: {
        name: 'Admin',
        email: 'admin@example.com',
        password: 'V1ct0r!!A@dm!!n',
      },
    });

    if (user) {
      await prisma.user.update({
        where: { email: user.email },
        data: { role: 'SUPER_ADMIN' },
      });
    }

    console.log('✅ Default admin user created');
  } else {
    console.log('⏭️ Admin already exists');
  }
}

main();
