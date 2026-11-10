
import React, { useState } from 'react';
import { Lock, ArrowRight, CheckCircle, Mail, Key } from 'lucide-react';
import { supabase } from '../utils/supabase';

// 로그인/가입에 성공하면 App이 Supabase 세션 변화를 감지해 화면을 전환한다.
export const Login: React.FC = () => {
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 'verify' = 인증 메일 발송 후 안내 화면
    const [signUpStep, setSignUpStep] = useState<'details' | 'verify'>('details');

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        setIsSubmitting(false);

        if (error) {
            alert(error.code === 'email_not_confirmed'
                ? '이메일 인증이 완료되지 않았습니다. 받은 메일의 인증 링크를 먼저 눌러주세요.'
                : '이메일 또는 비밀번호가 올바르지 않습니다.');
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password || !name) {
            alert('모든 필드를 입력해주세요.');
            return;
        }

        setIsSubmitting(true);
        // 프로필 생성과 초대 코드 입장은 DB 트리거(handle_new_user)가 처리한다.
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
                data: { name: name.trim(), invite_code: inviteCode.trim() },
                emailRedirectTo: window.location.origin
            }
        });
        setIsSubmitting(false);

        if (error) {
            alert(`회원가입에 실패했습니다.\n${error.message}`);
            return;
        }
        // 이미 가입된 이메일이면 Supabase는 오류 대신 identities가 빈 사용자를 돌려준다.
        if (data.user && data.user.identities?.length === 0) {
            alert('이미 등록된 이메일입니다.');
            return;
        }
        // 이메일 인증이 꺼져 있으면 세션이 바로 생겨 자동 로그인되고, 켜져 있으면 안내 화면을 보여준다.
        if (!data.session) {
            setSignUpStep('verify');
        }
    };

    const switchMode = (newMode: 'login' | 'signup') => {
        setMode(newMode);
        setSignUpStep('details');
        setEmail('');
        setPassword('');
        setName('');
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
                                <label className="block text-sm font-medium text-slate-700 mb-2">이메일</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="user@company.com"
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
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-60"
                            >
                                {isSubmitting ? '로그인 중...' : '로그인'}
                            </button>
                        </form>
                    )}

                    {mode === 'signup' && signUpStep === 'details' && (
                        <form onSubmit={handleSignUp} className="space-y-4">
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
                                    minLength={6}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="6자 이상"
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
                                disabled={isSubmitting}
                                className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-60"
                            >
                                {isSubmitting ? '가입 처리 중...' : <>회원가입 <ArrowRight size={18} /></>}
                            </button>
                        </form>
                    )}

                    {mode === 'signup' && signUpStep === 'verify' && (
                        <div className="space-y-6 text-center">
                            <CheckCircle className="mx-auto text-green-600" size={40} />
                            <div>
                                <h2 className="text-xl font-bold text-slate-800 mb-2">인증 메일을 보냈습니다</h2>
                                <p className="text-sm text-slate-500 leading-relaxed">
                                    <span className="font-bold">{email}</span> 로 발송된 메일의 인증 링크를 누르면 가입이 완료됩니다.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => switchMode('login')}
                                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors"
                            >
                                로그인 화면으로
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
