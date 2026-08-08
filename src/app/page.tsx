import { FinanceApp } from '@/components/finance/app';
import { AuthProvider } from '@/lib/finance/auth';
import { FinanceProvider } from '@/lib/finance/store';

const Page = () => {
    return (
        <AuthProvider>
            <FinanceProvider>
                <FinanceApp />
            </FinanceProvider>
        </AuthProvider>
    );
};

export default Page;
