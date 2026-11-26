/* A private DLL copy gives each provider its own receiver-side receipt.
   It never injects input or calls application code. */
typedef unsigned long DWORD;
typedef unsigned long long UPTR;
typedef long long IPTR;
typedef void *HANDLE;
typedef struct { long x, y; } POINT;
typedef struct {
    HANDLE hwnd;
    unsigned int message;
    UPTR wParam;
    IPTR lParam;
    DWORD time;
    POINT pt;
    DWORD privateValue;
} MSG;

__declspec(dllimport) IPTR __stdcall CallNextHookEx(HANDLE, int, UPTR, IPTR);
__declspec(dllimport) IPTR __stdcall GetMessageExtraInfo(void);
__declspec(dllimport) DWORD __stdcall GetCurrentThreadId(void);
__declspec(dllimport) HANDLE __stdcall GetForegroundWindow(void);

#pragma section(".hcu", read, write)
__declspec(allocate(".hcu")) UPTR expectedTag = 0;
__declspec(allocate(".hcu")) UPTR receivedTag = 0;
__declspec(allocate(".hcu")) UPTR processedTag = 0;
__declspec(allocate(".hcu")) DWORD expectedThread = 0;
__declspec(allocate(".hcu")) UPTR expectedWindow = 0;
__declspec(allocate(".hcu")) DWORD expectedMessage = 0;
__declspec(allocate(".hcu")) DWORD alternateMessage = 0;
__declspec(allocate(".hcu")) UPTR expectedWord = 0;
__declspec(allocate(".hcu")) DWORD checkWord = 0;

__declspec(dllexport) void __stdcall Configure(
    DWORD thread, UPTR window, UPTR tag, DWORD message,
    DWORD alternate, UPTR word, DWORD matchWord)
{
    __atomic_store_n(&expectedTag, 0, __ATOMIC_RELEASE);
    expectedThread = thread;
    expectedWindow = window;
    expectedMessage = message;
    alternateMessage = alternate;
    expectedWord = word;
    checkWord = matchWord;
    __atomic_store_n(&expectedTag, tag, __ATOMIC_RELEASE);
}

__declspec(dllexport) int __stdcall Processed(void)
{
    UPTR tag = __atomic_load_n(&expectedTag, __ATOMIC_ACQUIRE);
    return tag && __atomic_load_n(&processedTag, __ATOMIC_ACQUIRE) == tag;
}

__declspec(dllexport) IPTR __stdcall MessageHook(int code, UPTR remove, IPTR parameter)
{
    UPTR tag = __atomic_load_n(&expectedTag, __ATOMIC_ACQUIRE);
    if (tag && code >= 0 && remove == 1 && GetCurrentThreadId() == expectedThread) {
        MSG *message = (MSG *)parameter;
        if ((UPTR)GetMessageExtraInfo() == tag &&
            (message->message == expectedMessage || message->message == alternateMessage) &&
            (!checkWord || message->wParam == expectedWord) &&
            __atomic_load_n(&expectedTag, __ATOMIC_ACQUIRE) == tag)
            __atomic_store_n(&receivedTag, tag, __ATOMIC_RELEASE);
    }
    return CallNextHookEx(0, code, remove, parameter);
}

__declspec(dllexport) IPTR __stdcall IdleHook(int code, UPTR word, IPTR parameter)
{
    UPTR tag = __atomic_load_n(&expectedTag, __ATOMIC_ACQUIRE);
    if (tag && code >= 0 &&
        __atomic_load_n(&receivedTag, __ATOMIC_ACQUIRE) == tag &&
        GetCurrentThreadId() == expectedThread &&
        (UPTR)GetForegroundWindow() == expectedWindow &&
        __atomic_load_n(&expectedTag, __ATOMIC_ACQUIRE) == tag)
        __atomic_store_n(&processedTag, tag, __ATOMIC_RELEASE);
    return CallNextHookEx(0, code, word, parameter);
}

int __stdcall DllMain(HANDLE module, DWORD reason, void *reserved)
{
    (void)module;
    (void)reason;
    (void)reserved;
    return 1;
}
