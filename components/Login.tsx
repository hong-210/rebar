
import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, CheckCircle, ShieldCheck, User as UserIcon, Key } from 'lucide-react';
import { User } from '../types';

export interface UserAccount extends User {
    id?: string;
    password?: string;
}

interface LoginProps {
    onLogin: (user: User) => void;
    onRegister: (user: UserAccount, inviteCode?: string) => void;
    registeredUsers: UserAccount[];
}

export const Login: React.FC<LoginProps> = ({ onLogin, onRegister, registeredUsers }) => {
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    
    // Signup Verification
    const [signUpStep, setSignUpStep] = useState<'details' | 'verify'>('details');
    const [verificationCode, setVerificationCode] = useState('');
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);

    const handleLoginSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Find user by Email or ID (since admin uses 'admin' as ID)
        const foundUser = registeredUsers.find(
            u => (u.email === email || u.id === email) && u.password === password
        );

        if (foundUser) {
            onLogin({
                email: foundUser.email,
                name: foundUser.name,
                role: foundUser.role
            });
        } else {
            alert('아이디 또는 비밀번호가 올바르지 않습니다.');
        }
    };

    const handleSendVerification = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password || !name) {
            alert('모든 필드를 입력해주세요.');
            return;
        }
        
        // Check if email already exists
        if (registeredUsers.find(u => u.email === email)) {
            alert('이미 등록된 이메일입니다.');
            return;
        }

        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        setGeneratedCode(newCode);
        setSignUpStep('verify');
        
        setTimeout(() => {
            alert(`[인증 코드 발송]\n인증코드: ${newCode}\n(메일 발송 시뮬레이션)`);
        }, 500);
    };

    const handleCompleteSignUp = (e: React.FormEvent) => {
        e.preventDefault();
        if (verificationCode === generatedCode || verificationCode === '000000') {
            const newUser: UserAccount = {
                id: email, // Use email as ID for normal users
                email: email,
                name: name,
                password: password,
                role: 'viewer'
            };
            
            alert('회원가입이 완료되었습니다.');
            onRegister(newUser, inviteCode);
        } else {
            alert('인증 코드가 일치하지 않습니다.');
        }
    };

    const switchMode = (newMode: 'login' | 'signup') => {
        setMode(newMode);
        setSignUpStep('details');
        setEmail('');
        setPassword('');
        setName('');
        setVerificationCode('');
        setInviteCode('');
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="bg-slate-900 p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-2">RebarMaster Pro</h1>
                    <p className="text-slate-400 text-sm">건설 물량 관리 플랫폼</p>
                </div>

                <div className="flex border-b border-slate-100">
                    <button 
                        onClick={() => switchMode('login')}
                        className={`flex-1 py-4 text-sm font-bold transition-colors ${mode === 'login' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        로그인 (Sign In)
                    </button>
                    <button 
                        onClick={() => switchMode('signup')}
                        className={`flex-1 py-4 text-sm font-bold transition-colors ${mode === 'signup' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        회원가입 (Sign Up)
                    </button>
                </div>
                
                <div className="p-8 flex-1">
                    {mode === 'login' && (
                        <form onSubmit={handleLoginSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">아이디 또는 이메일</label>
                                <div className="relative">
                                    <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                                    <input 
                                        type="text" 
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="admin or user@company.com"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">비밀번호</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                                    <input 
                                        type="password" 
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest"
                                        placeholder="••••••"
                                    />
                                </div>
                            </div>
                            <button 
                                type="submit"
                                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                            >
                                로그인
                            </button>
                        </form>
                    )}

                    {mode === 'signup' && signUpStep === 'details' && (
                        <form onSubmit={handleSendVerification} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">이름 (Name)</label>
                                <input 
                                    type="text" 
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="홍길동"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">이메일 (Email)</label>
                                <input 
                                    type="email" 
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="user@company.com"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">비밀번호 (Password)</label>
                                <input 
                                    type="password" 
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="••••••"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">프로젝트 초대 코드 (선택)</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                                    <input 
                                        type="text" 
                                        value={inviteCode}
                                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                        className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase placeholder:normal-case"
                                        placeholder="초대 코드가 있다면 입력하세요"
                                        maxLength={6}
                                    />
                                </div>
                            </div>
                            <button 
                                type="submit"
                                className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 mt-4"
                            >
                                이메일 인증코드 발송 <ArrowRight size={18} />
                            </button>
                        </form>
                    )}

                    {mode === 'signup' && signUpStep === 'verify' && (
                        <form onSubmit={handleCompleteSignUp} className="space-y-6">
                            <div>
                                <button 
                                    type="button" 
                                    onClick={() => setSignUpStep('details')}
                                    className="text-sm text-slate-500 mb-4 hover:text-blue-600 block"
                                >
                                    ← 정보 수정하기
                                </button>
                                <h2 className="text-xl font-bold text-slate-800 mb-2">인증번호 확인</h2>
                                <p className="text-sm text-slate-500 mb-6">
                                    <span className="font-bold">{email}</span> 로 발송된 6자리 코드를 입력해주세요.
                                </p>
                                <label className="block text-sm font-medium text-slate-700 mb-2">인증 코드</label>
                                <div className="relative">
                                    <ShieldCheck className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                                    <input 
                                        type="text" 
                                        required
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-lg"
                                        placeholder="000000"
                                        maxLength={6}
                                    />
                                </div>
                            </div>
                            <button 
                                type="submit"
                                className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                            >
                                가입 및 로그인 완료 <CheckCircle size={20} />
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
