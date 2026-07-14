//! Pairing code generation.
//!
//! MVP: locally generate a 6-char code from a friendly alphabet.
//! Phase 2 will POST the code to the signaling service and open a WebSocket
//! for SDP/ICE relay to the claiming client.

use rand::seq::SliceRandom;

const ALPHABET: &[u8] = b"23456789abcdefghjkmnpqrstuvwxyz";
const CODE_LEN: usize = 6;

#[tauri::command]
pub fn request_pairing_code() -> String {
    let mut rng = rand::thread_rng();
    (0..CODE_LEN)
        .map(|_| *ALPHABET.choose(&mut rng).expect("alphabet non-empty") as char)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_shape() {
        let c = request_pairing_code();
        assert_eq!(c.len(), CODE_LEN);
        assert!(c.chars().all(|ch| ALPHABET.contains(&(ch as u8))));
    }
}
